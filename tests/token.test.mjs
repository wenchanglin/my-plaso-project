import test from "node:test"
import assert from "node:assert/strict"
import { AbiCoder } from "ethers"

import {
  createTokenTransfer,
  createTrackedToken,
  detectTokenStandard,
  readTokenBalance,
  readTokenMetadata,
  tokenKey
} from "../src/lib/token.ts"

// `token.ts` takes its `eth_call` as a parameter, so nothing here opens a socket:
// every contract below is a table from 4-byte selector to canned hex. That is
// also the only way to reproduce the answers that matter — a revert, an empty
// `0x`, a proxy returning garbage — which no live contract gives on demand.

const coder = AbiCoder.defaultAbiCoder()

const CONTRACT = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

const NAME = "0x06fdde03"
const SYMBOL = "0x95d89b41"
const DECIMALS = "0x313ce567"
const BALANCE_OF = "0x70a08231"
const BALANCE_OF_ID = "0x00fdd58e"
const OWNER_OF = "0x6352211e"
const SUPPORTS_721 = "0x01ffc9a780ac58cd"
const SUPPORTS_1155 = "0x01ffc9a7d9b67a26"

/** Reverts the way a node rejects a call to a function a contract lacks. */
const REVERT = Symbol("revert")

/**
 * Fake `EthCall`, dispatching on the selector — and on the interface id too for
 * `supportsInterface`, which detection asks twice. Anything unlisted reverts,
 * which is what a contract missing that function really does.
 */
const callWith = (answers) => async (_to, data) => {
  const key = data.startsWith("0x01ffc9a7") ? data.slice(0, 18) : data.slice(0, 10)
  const answer = answers[key]
  if (answer === undefined || answer === REVERT) {
    const cause = new Error("execution reverted")
    cause.code = "CALL_EXCEPTION"
    throw cause
  }
  return answer
}

const bool = (value) => coder.encode(["bool"], [value])
const uint = (value) => coder.encode(["uint256"], [value])

const erc20 = {
  [DECIMALS]: coder.encode(["uint8"], [6]),
  [NAME]: coder.encode(["string"], ["USD Coin"]),
  [SYMBOL]: coder.encode(["string"], ["USDC"])
}

const erc721 = {
  [SUPPORTS_721]: bool(true),
  [NAME]: coder.encode(["string"], ["CryptoPunks"]),
  [SYMBOL]: coder.encode(["string"], ["PUNK"])
}

const erc1155 = {
  [SUPPORTS_721]: bool(false),
  [SUPPORTS_1155]: bool(true)
}

test("detects each standard, and ERC-20 despite it having no ERC-165", async () => {
  assert.equal(await detectTokenStandard(callWith(erc20), CONTRACT), "ERC20")
  assert.equal(await detectTokenStandard(callWith(erc721), CONTRACT), "ERC721")
  assert.equal(await detectTokenStandard(callWith(erc1155), CONTRACT), "ERC1155")
})

test("a reverting or empty supportsInterface means 'not that standard'", async () => {
  // The two ways a non-ERC-165 contract answers. Reading either as an RPC fault
  // would make every ERC-20 undetectable, which is the common case.
  const reverting = callWith({ ...erc20, [SUPPORTS_721]: REVERT })
  const empty = callWith({ ...erc20, [SUPPORTS_721]: "0x", [SUPPORTS_1155]: "0x" })

  assert.equal(await detectTokenStandard(reverting, CONTRACT), "ERC20")
  assert.equal(await detectTokenStandard(empty, CONTRACT), "ERC20")
})

test("a proxy answering supportsInterface with garbage counts as false", async () => {
  // ethers decodes any non-zero word as `true`, so this is matched as hex. A
  // contract that returns 2, or a truncated word, must not become an ERC-721.
  for (const garbage of [uint(2), "0x1234", uint(0)]) {
    const call = callWith({ ...erc20, [SUPPORTS_721]: garbage })
    assert.equal(await detectTokenStandard(call, CONTRACT), "ERC20")
  }
})

test("a proxy claiming both interfaces resolves to ERC-721", async () => {
  const call = callWith({ [SUPPORTS_721]: bool(true), [SUPPORTS_1155]: bool(true) })
  assert.equal(await detectTokenStandard(call, CONTRACT), "ERC721")
})

test("an unrecognizable contract is recoverable, not an error about the chain", async () => {
  // Also what a dead RPC produces: three failed probes are indistinguishable from
  // a contract that answers nothing, so the message points at the manual picker
  // instead of claiming the contract is broken.
  await assert.rejects(
    () => detectTokenStandard(callWith({}), CONTRACT),
    /无法识别合约类型，请手动选择标准/
  )
})

test("names which dead end an undetectable address is, when it can", async () => {
  // From a real report: an OpenZeppelin `ProxyAdmin` address was pasted in, and
  // the generic message read as the wallet failing, so the standard was chosen by
  // hand — which could only fail again, `balanceOf` reverting there as well.
  await assert.rejects(
    () => detectTokenStandard(callWith({}), CONTRACT, async () => "0x6080604052"),
    /不响应任何代币接口/
  )
  await assert.rejects(
    () => detectTokenStandard(callWith({}), CONTRACT, async () => "0x"),
    /该地址上没有合约/
  )
  // A failing `eth_getCode` says nothing about the address, so the message stays
  // generic rather than accusing the address of being empty.
  await assert.rejects(
    () =>
      detectTokenStandard(callWith({}), CONTRACT, async () => {
        throw new Error("timeout")
      }),
    /无法识别合约类型，请手动选择标准/
  )
})

test("an absurd decimals is rejected instead of reaching parseUnits", async () => {
  // 40 decodes as a perfectly valid uint8; only an explicit range check stops it.
  const call = callWith({ [DECIMALS]: coder.encode(["uint8"], [40]) })

  await assert.rejects(
    () => detectTokenStandard(call, CONTRACT),
    /合约返回的精度不合法/
  )
  await assert.rejects(
    () => readTokenMetadata(call, "ERC20", CONTRACT),
    /合约返回的精度不合法/
  )
})

test("reads metadata per standard, and leaves ERC-1155 to the user", async () => {
  assert.deepEqual(await readTokenMetadata(callWith(erc20), "ERC20", CONTRACT), {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6
  })

  // ERC-721 has no `decimals()`; whole tokens are counted, so 0 is not a read.
  assert.deepEqual(await readTokenMetadata(callWith(erc721), "ERC721", CONTRACT), {
    name: "CryptoPunks",
    symbol: "PUNK",
    decimals: 0
  })

  // No on-chain name or symbol exists: they live in the JSON behind `uri(id)`,
  // which this wallet deliberately does not fetch.
  assert.deepEqual(await readTokenMetadata(callWith(erc1155), "ERC1155", CONTRACT), {
    name: "",
    symbol: "",
    decimals: 0
  })
})

test("a bytes32 symbol degrades to empty rather than failing the add", async () => {
  // Pre-ERC-20-final tokens such as MKR return `bytes32`, which cannot decode as
  // a string. The form still lets the user name it.
  const call = callWith({ ...erc20, [SYMBOL]: coder.encode(["bytes32"], ["0x4d4b520000000000000000000000000000000000000000000000000000000000"]) })
  const metadata = await readTokenMetadata(call, "ERC20", CONTRACT)

  assert.equal(metadata.symbol, "")
  assert.equal(metadata.decimals, 6)
})

const track = (overrides) =>
  createTrackedToken({
    chainId: 11155111,
    standard: "ERC20",
    address: CONTRACT,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    ...overrides
  })

test("scales an ERC-20 balance by the token's own decimals", async () => {
  const call = callWith({ [BALANCE_OF]: uint(1500000n) })
  assert.equal(await readTokenBalance(call, track({}), OWNER), "1.5")
})

test("an ERC-721 collection reports how many are held", async () => {
  // Not which ones: listing ids needs an indexer, which an extension has no
  // access to. `decimals` is 0, so the count comes back unshifted.
  const token = track({ standard: "ERC721", symbol: "PUNK", decimals: 0 })
  const call = callWith({ [BALANCE_OF]: uint(3n) })

  assert.equal(await readTokenBalance(call, token, OWNER), "3")
})

test("an ERC-721 token id reports held or not, casing aside", async () => {
  const token = track({ standard: "ERC721", symbol: "PUNK", tokenId: "42" })

  const mine = callWith({ [OWNER_OF]: coder.encode(["address"], [OWNER.toLowerCase()]) })
  const theirs = callWith({ [OWNER_OF]: coder.encode(["address"], [OTHER]) })

  assert.equal(await readTokenBalance(mine, token, OWNER), "1")
  assert.equal(await readTokenBalance(theirs, token, OWNER), "0")
  // `ownerOf` reverts for a burned or never-minted id: "not held", not a fault.
  assert.equal(await readTokenBalance(callWith({}), token, OWNER), "0")
})

test("an ERC-1155 balance uses the two-argument balanceOf", async () => {
  const token = track({ standard: "ERC1155", symbol: "ITEM", tokenId: "7" })
  // Keyed on the overloaded selector, proving the id reached the call.
  const call = callWith({ [BALANCE_OF_ID]: uint(42n) })

  assert.equal(await readTokenBalance(call, token, OWNER), "42")
})

test("the key ignores address casing but not chain or token id", () => {
  // The reference implementation keyed on the address alone, so the same contract
  // on two chains overwrote itself and two ids of one ERC-1155 could not coexist.
  assert.equal(
    tokenKey(1, CONTRACT.toLowerCase()),
    tokenKey(1, CONTRACT.toUpperCase().replace("0X", "0x"))
  )
  assert.notEqual(tokenKey(1, CONTRACT), tokenKey(137, CONTRACT))
  assert.notEqual(tokenKey(1, CONTRACT, "1"), tokenKey(1, CONTRACT, "2"))
})

test("keeps a typed precision of 0 instead of defaulting it to 18", () => {
  // `parseInt(input) || 18` in the reference implementation turned a deliberate 0
  // into 18, which then divided every balance by 10^18.
  assert.equal(track({ decimals: 0 }).decimals, 0)
})

test("checksums the address for display and lowercases it for identity", () => {
  const token = track({ address: CONTRACT.toLowerCase() })

  assert.equal(token.address, CONTRACT)
  assert.equal(token.key, `11155111:${CONTRACT.toLowerCase()}:`)
})

test("forces whole units on the standards that have no decimals", () => {
  assert.equal(track({ standard: "ERC721", decimals: 18 }).decimals, 0)
  assert.equal(track({ standard: "ERC1155", decimals: 18, tokenId: "7" }).decimals, 0)
})

test("falls back to the symbol when no name is given", () => {
  assert.equal(track({ name: "   " }).name, "USDC")
})

test("rejects malformed token input", () => {
  assert.throws(() => track({ address: "not-an-address" }), /无效的合约地址/)
  assert.throws(() => track({ symbol: " " }), /请输入代币符号/)
  assert.throws(() => track({ standard: "ERC1155" }), /ERC-1155 需要填写 Token ID/)
  assert.throws(() => track({ tokenId: "7" }), /ERC-20 代币没有 Token ID/)
  assert.throws(
    () => track({ standard: "ERC721", tokenId: "0x01" }),
    /Token ID 必须是非负整数/
  )
  assert.throws(() => track({ decimals: 40 }), /精度必须是 0 到 36 之间的整数/)
  assert.throws(() => track({ decimals: 1.5 }), /精度必须是 0 到 36 之间的整数/)
})

const usdc = { address: CONTRACT, decimals: 6, standard: "ERC20" }

test("encodes transfer at the token's precision, never at 18", () => {
  const transfer = createTokenTransfer(usdc, OWNER, "1.5", "10")

  assert.equal(transfer.to, CONTRACT)
  assert.ok(transfer.data.startsWith("0xa9059cbb"), "wrong function selector")
  // 1.5 at 6 decimals is 1500000 (0x16e360). `parseEther` would have encoded
  // 1500000000000000000 here, a million million times the intended amount.
  assert.ok(transfer.data.endsWith("16e360"), transfer.data)
  assert.equal(BigInt(`0x${transfer.data.slice(-64)}`), 1500000n)
})

test("sends the whole token balance without reserving a fee", () => {
  // Unlike the native transfer: gas is paid in the native coin, so emptying a
  // token balance is legitimate. The screen warns about a zero native balance.
  assert.doesNotThrow(() => createTokenTransfer(usdc, OWNER, "10", "10"))
})

test("rejects malformed transfers", () => {
  assert.throws(
    () => createTokenTransfer({ ...usdc, standard: "ERC721" }, OWNER, "1", "10"),
    /暂不支持发送该类型代币/
  )
  assert.throws(
    () => createTokenTransfer(usdc, "not-an-address", "1", "10"),
    /无效的接收地址/
  )
  assert.throws(() => createTokenTransfer(usdc, OWNER, " ", "10"), /请输入金额/)
  assert.throws(() => createTokenTransfer(usdc, OWNER, "1e-3", "10"), /无效的金额/)
  assert.throws(() => createTokenTransfer(usdc, OWNER, "0", "10"), /金额必须大于 0/)
  assert.throws(
    () => createTokenTransfer(usdc, OWNER, "10.000001", "10"),
    /代币余额不足/
  )
})

test("compares amount and balance in base units, not as floats", () => {
  // 6-decimal precision is exactly where a float comparison starts rounding.
  assert.doesNotThrow(() => createTokenTransfer(usdc, OWNER, "0.000001", "0.000001"))
  assert.throws(
    () => createTokenTransfer(usdc, OWNER, "0.0000011", "0.000001"),
    /无效的金额/
  )
})

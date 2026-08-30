/**
 * Token registry primitives: standard detection, metadata and balance reads,
 * and the two pure builders behind the add-token form and the send screen.
 *
 * Every chain read goes through an injected `EthCall`, so this module imports
 * no provider class and the tests can feed it canned ABI hex. Constructing a
 * `JsonRpcProvider` stays at the edge, in `use-token-balances.ts`, the same way
 * `use-native-balance.ts` owns the provider for the native read.
 */
import { formatUnits, getAddress, Interface, isAddress, parseUnits } from "ethers"

import type { TokenStandard, TrackedToken } from "../types/wallet.ts"

/** One `eth_call`, resolving to the raw hex result. */
export type EthCall = (to: string, data: string) => Promise<string>

/** One `eth_getCode`, resolving to the deployed bytecode as hex. */
export type EthGetCode = (address: string) => Promise<string>

/**
 * Adapts a provider to `EthCall`. Structurally typed on purpose: naming
 * `JsonRpcProvider` here would pull ethers' provider stack into every test.
 */
export const ethCallVia = (provider: {
  call: (tx: { to: string; data: string }) => Promise<string>
}): EthCall => {
  return (to, data) => provider.call({ to, data })
}

/** The same adapter for `eth_getCode`, used only to explain a failed detection. */
export const codeVia = (provider: {
  getCode: (address: string) => Promise<string>
}): EthGetCode => {
  return (address) => provider.getCode(address)
}

/**
 * `Interface` rather than `Contract`: these eight functions need no runtime
 * network probe and `Contract` would open one. `balanceOf` is overloaded, so
 * both variants are always addressed by their full signature.
 */
const tokenAbi = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
])

const ERC721_INTERFACE_ID = "0x80ac58cd"
const ERC1155_INTERFACE_ID = "0xd9b67a26"

/** Beyond this, `parseUnits` yields numbers no chain uses and no UI can show. */
const MAX_DECIMALS = 36

/**
 * Identity of a tracked token. `chainId` keeps the same contract on two chains
 * from overwriting itself; `tokenId` keeps two ids of one ERC-1155 apart.
 */
export const tokenKey = (
  chainId: number,
  address: string,
  tokenId?: string
): string => `${chainId}:${address.trim().toLowerCase()}:${tokenId?.trim() ?? ""}`

/**
 * Shared by the contract read and the manual form. A hostile `decimals()` of
 * 2^256-1 decodes cleanly and only explodes much later, inside `parseUnits`.
 */
const normalizeDecimals = (value: bigint | number, message: string): number => {
  const decimals = Number(value)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error(message)
  }
  return decimals
}

const callDecimals = async (call: EthCall, address: string): Promise<bigint> => {
  const raw = await call(address, tokenAbi.encodeFunctionData("decimals", []))
  const [value] = tokenAbi.decodeFunctionResult("decimals", raw)
  return value as bigint
}

const readString = async (
  call: EthCall,
  address: string,
  fn: "name" | "symbol"
): Promise<string> => {
  try {
    const raw = await call(address, tokenAbi.encodeFunctionData(fn, []))
    const [value] = tokenAbi.decodeFunctionResult(fn, raw)
    return String(value).trim()
  } catch {
    // Both are optional in ERC-20, and older tokens answer with a `bytes32` that
    // will not decode as a string. Neither is worth refusing the token over: the
    // form keeps whatever the user typed.
    return ""
  }
}

const supportsInterface = async (
  call: EthCall,
  address: string,
  interfaceId: string
): Promise<boolean> => {
  let raw: string
  try {
    raw = await call(
      address,
      tokenAbi.encodeFunctionData("supportsInterface", [interfaceId])
    )
  } catch {
    // A contract without ERC-165 — every ERC-20 — reverts here. That is an
    // answer ("not this standard"), not a fault, so detection keeps going.
    return false
  }

  // Matched as hex instead of decoded: ethers reads any non-zero word as `true`,
  // so a proxy answering with garbage would pass. `0x`, truncated data and
  // anything other than a canonical `1` all mean no.
  return /^0x0{63}1$/.test(raw.trim().toLowerCase())
}

/**
 * Turns three dead probes into the most specific message the evidence supports.
 * "Answers nothing" has three unrelated causes — the address holds no code at
 * all, it holds a contract that is not a token, or the RPC is failing — and only
 * the middle one is worth reaching for the manual picker over.
 */
const explainUndetectable = async (
  address: string,
  getCode?: EthGetCode
): Promise<string> => {
  const generic = "无法识别合约类型，请手动选择标准"
  if (!getCode) return generic

  let code: string
  try {
    code = await getCode(address)
  } catch {
    // The RPC is the suspect now, so saying anything about the address would be
    // a guess. The manual picker is still the way out.
    return generic
  }

  if (code.replace(/^0x/i, "") === "") {
    return "该地址上没有合约，请确认地址是否正确，以及是否选对了网络"
  }
  return "该地址是合约，但不响应任何代币接口，可能不是代币合约；确定的话请手动选择标准"
}

/**
 * ERC-165 probe, falling back to the shape of the contract.
 *
 * ERC-721 is tested before ERC-1155 so a broken proxy claiming both resolves to
 * one answer instead of failing. ERC-20 comes last because it has no ERC-165 to
 * ask: a `decimals()` that decodes is the only evidence available.
 */
export const detectTokenStandard = async (
  call: EthCall,
  address: string,
  /**
   * Used only once every probe has failed, to name which dead end this is.
   * Optional so the pure-call tests can keep passing two arguments.
   */
  getCode?: EthGetCode
): Promise<TokenStandard> => {
  if (await supportsInterface(call, address, ERC721_INTERFACE_ID)) return "ERC721"
  if (await supportsInterface(call, address, ERC1155_INTERFACE_ID)) return "ERC1155"

  let decimals: bigint
  try {
    decimals = await callDecimals(call, address)
  } catch {
    // Detection is always recoverable, never a dead end: whichever message comes
    // back, the form leaves the standard picker editable so the user can say what
    // this is. `decimals()` is optional in ERC-20, so a token that omits it lands
    // here too and has to be filled in by hand.
    throw new Error(await explainUndetectable(address, getCode))
  }

  // A lie here is worth reporting rather than swallowing: the contract does
  // answer `decimals()`, it just answers with something unusable.
  normalizeDecimals(decimals, "合约返回的精度不合法")
  return "ERC20"
}

export interface TokenMetadata {
  name: string
  symbol: string
  decimals: number
}

/**
 * Whatever the contract will say about itself.
 *
 * ERC-1155 comes back empty: the standard has no on-chain `name()`/`symbol()`,
 * it puts them in the JSON behind `uri(id)`. Fetching that would mean an extra
 * request through an IPFS gateway, which leaks the holding to a third-party host
 * and needs a CSP hole, so the form asks the user instead.
 */
export const readTokenMetadata = async (
  call: EthCall,
  standard: TokenStandard,
  address: string
): Promise<TokenMetadata> => {
  if (standard === "ERC1155") return { name: "", symbol: "", decimals: 0 }

  const [name, symbol] = await Promise.all([
    readString(call, address, "name"),
    readString(call, address, "symbol")
  ])

  // ERC-721 counts whole tokens, so it has no `decimals()` to read.
  const decimals =
    standard === "ERC20"
      ? normalizeDecimals(await callDecimals(call, address), "合约返回的精度不合法")
      : 0

  return { name, symbol, decimals }
}

/**
 * Balance as a display string.
 *
 * The three standards answer three different questions, and the ERC-721 one is
 * the reason this cannot be uniform: without an indexer a wallet cannot list
 * which ids an address holds, so a collection with no `tokenId` reports how many
 * are held, and one with a `tokenId` reports whether that single id is held.
 */
export const readTokenBalance = async (
  call: EthCall,
  token: TrackedToken,
  owner: string
): Promise<string> => {
  const holder = owner.trim()

  if (token.standard === "ERC1155") {
    if (!token.tokenId) throw new Error("ERC-1155 代币缺少 Token ID")
    const raw = await call(
      token.address,
      tokenAbi.encodeFunctionData("balanceOf(address,uint256)", [
        holder,
        token.tokenId
      ])
    )
    const [amount] = tokenAbi.decodeFunctionResult("balanceOf(address,uint256)", raw)
    return formatUnits(amount as bigint, token.decimals)
  }

  if (token.standard === "ERC721" && token.tokenId) {
    try {
      const raw = await call(
        token.address,
        tokenAbi.encodeFunctionData("ownerOf", [token.tokenId])
      )
      const [current] = tokenAbi.decodeFunctionResult("ownerOf", raw)
      return String(current).toLowerCase() === holder.toLowerCase() ? "1" : "0"
    } catch {
      // `ownerOf` reverts for a burned or never-minted id. "Not held" is the
      // honest reading of that, not a failed read.
      return "0"
    }
  }

  const raw = await call(
    token.address,
    tokenAbi.encodeFunctionData("balanceOf(address)", [holder])
  )
  const [amount] = tokenAbi.decodeFunctionResult("balanceOf(address)", raw)
  // ERC-721 without an id lands here as well: `decimals` is 0 for it, so
  // `formatUnits` hands back the collection count unchanged.
  return formatUnits(amount as bigint, token.decimals)
}

export interface TrackedTokenInput {
  chainId: number
  standard: TokenStandard
  address: string
  symbol: string
  name: string
  /** Ignored for ERC-721 and ERC-1155, which are always whole units. */
  decimals: number
  tokenId?: string
}

/**
 * Validates and normalizes a form submission into a persistable record. Pure:
 * the caller has already read whatever the contract was willing to say.
 */
export const createTrackedToken = (input: TrackedTokenInput): TrackedToken => {
  const candidate = input.address.trim()
  if (!isAddress(candidate)) throw new Error("无效的合约地址")

  const symbol = input.symbol.trim()
  if (!symbol) throw new Error("请输入代币符号")

  const tokenId = input.tokenId?.trim() ?? ""
  if (tokenId && !/^\d+$/.test(tokenId)) {
    throw new Error("Token ID 必须是非负整数")
  }
  if (input.standard === "ERC1155" && !tokenId) {
    throw new Error("ERC-1155 需要填写 Token ID")
  }
  if (input.standard === "ERC20" && tokenId) {
    throw new Error("ERC-20 代币没有 Token ID")
  }

  // Forced to 0 for the whole-unit standards rather than trusted from the form: a
  // stored non-zero precision would make `formatUnits` shift a token count.
  const decimals =
    input.standard === "ERC20"
      ? normalizeDecimals(input.decimals, "精度必须是 0 到 36 之间的整数")
      : 0

  // Checksummed for display only. Identity stays lowercase, inside `key`, so the
  // same contract typed in two casings cannot be added twice.
  const address = getAddress(candidate)

  return {
    key: tokenKey(input.chainId, address, tokenId),
    chainId: input.chainId,
    standard: input.standard,
    address,
    symbol,
    name: input.name.trim() || symbol,
    decimals,
    ...(tokenId ? { tokenId } : {})
  }
}

export interface TokenTransfer {
  /** The token contract: an ERC-20 transfer carries no native value. */
  to: string
  data: string
}

/**
 * Builds an ERC-20 `transfer` from user-facing decimal strings, mirroring
 * `createNativeTransfer`: `balance` arrives as a string so this stays offline.
 */
export const createTokenTransfer = (
  token: Pick<TrackedToken, "address" | "decimals" | "standard">,
  recipient: string,
  amount: string,
  balance: string
): TokenTransfer => {
  // ERC-721 and ERC-1155 move through `safeTransferFrom`, which needs a token id
  // in the confirm screen and a different set of checks. Next round.
  if (token.standard !== "ERC20") throw new Error("暂不支持发送该类型代币")

  const to = recipient.trim()
  if (!isAddress(to)) throw new Error("无效的接收地址")

  const normalizedAmount = amount.trim()
  if (!normalizedAmount) throw new Error("请输入金额")

  let value: bigint
  let available: bigint
  try {
    // The token's own precision, never `parseEther`: a 6-decimal amount scaled by
    // 18 would send a million million times too much.
    value = parseUnits(normalizedAmount, token.decimals)
    available = parseUnits(balance, token.decimals)
  } catch {
    throw new Error("无效的金额")
  }

  if (value <= 0n) throw new Error("金额必须大于 0")
  if (value > available) throw new Error("代币余额不足")

  // Deliberately no "leave something for the fee" check, unlike the native
  // transfer: the fee is paid in the native coin, so emptying a token balance is
  // legitimate. `SendToken` warns about a zero native balance instead.
  return {
    to: token.address,
    data: tokenAbi.encodeFunctionData("transfer", [to, value])
  }
}

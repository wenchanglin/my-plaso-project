import test from "node:test"
import assert from "node:assert/strict"

import { createEthereumRequestHandler } from "../src/background/ethereum-router.ts"

const ORIGIN = "https://app.example"
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const ACCOUNT = { address: ADDRESS, name: "Account 1", index: 0 }

const request = (method, params = []) => ({
  from: "my-wallet-injected",
  type: "ETHEREUM_REQUEST",
  requestId: `request-${method}`,
  data: { method, params }
})

const createWallet = (overrides = {}) => {
  const connections = new Set(overrides.connections ?? [ORIGIN])
  return {
    connections,
    wallet: {
      getCurrentAccount: async () => overrides.account ?? ACCOUNT,
      isUnlocked: async () => overrides.unlocked !== false,
      isConnected: async (origin) => connections.has(origin),
      connect: async (origin) => connections.add(origin),
      disconnect: async (origin) => connections.delete(origin),
      getCurrentNetwork: async () => overrides.network ?? {
        id: "sepolia", name: "Sepolia", rpcUrl: "https://rpc.example", chainId: 11155111, symbol: "ETH"
      },
      findNetworkByChainId: async () => null,
      addNetwork: async () => {},
      switchNetwork: async () => {},
      signMessage: async () => "0xsig",
      signTypedData: async () => "0xtyped",
      sendTransaction: async () => "0xhash"
    }
  }
}

const createHandler = (wallet, decision = { approved: true }) =>
  createEthereumRequestHandler({
    wallet: wallet.wallet,
    requestAuthorization: async () => decision,
    rpcRequest: async () => ({ result: "0x1" })
  })

test("returns connected accounts and chain metadata", async () => {
  const handler = createHandler(createWallet())
  assert.deepEqual(await handler(request("eth_accounts"), { origin: ORIGIN }), [ADDRESS])
  assert.equal(await handler(request("eth_chainId"), { origin: ORIGIN }), "0xaa36a7")
  assert.equal(await handler(request("net_version"), { origin: ORIGIN }), "11155111")
})

test("uses standard errors for disconnected, rejected, and unsupported calls", async () => {
  const disconnected = createHandler(createWallet({ connections: [] }))
  await assert.rejects(
    disconnected(request("eth_sendTransaction", [{ from: ADDRESS }]), { origin: ORIGIN }),
    (error) => error.code === 4100
  )

  const rejected = createHandler(createWallet(), { approved: false })
  await assert.rejects(
    rejected(request("personal_sign", ["0x6869", ADDRESS]), { origin: ORIGIN }),
    (error) => error.code === 4001
  )

  const unsupported = createHandler(createWallet())
  await assert.rejects(
    unsupported(request("eth_signTransaction", []), { origin: ORIGIN }),
    (error) => error.code === 4200
  )
})

test("delegates typed-data signing only after authorization", async () => {
  const wallet = createWallet()
  const handler = createHandler(wallet)
  const result = await handler(
    request("eth_signTypedData_v4", [ADDRESS, JSON.stringify({ types: {}, message: {} })]),
    { origin: ORIGIN }
  )
  assert.equal(result, "0xtyped")
})

test("never forwards raw transaction submission through the read-only RPC path", async () => {
  let forwarded = false
  const wallet = createWallet()
  const handler = createEthereumRequestHandler({
    wallet: wallet.wallet,
    requestAuthorization: async () => ({ approved: true }),
    rpcRequest: async () => {
      forwarded = true
      return "0xhash"
    }
  })

  await assert.rejects(
    handler(request("eth_sendRawTransaction", ["0xdeadbeef"]), { origin: ORIGIN }),
    (error) => error.code === 4200
  )
  assert.equal(forwarded, false)
})

test("accepts both personal_sign parameter orderings", async () => {
  const calls = []
  const wallet = createWallet()
  wallet.wallet.signMessage = async (address, message) => {
    calls.push({ address, message })
    return "0xsig"
  }
  const handler = createHandler(wallet)

  await handler(request("personal_sign", ["hello", ADDRESS.toLowerCase()]), { origin: ORIGIN })
  await handler(request("personal_sign", [ADDRESS, "hello"]), { origin: ORIGIN })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].address, ADDRESS.toLowerCase())
  assert.equal(calls[0].message, "hello")
  assert.equal(calls[1].address, ADDRESS)
  assert.equal(calls[1].message, "hello")
})

test("passes JSON-RPC gas through the transaction gateway", async () => {
  const captured = []
  const wallet = createWallet()
  wallet.wallet.sendTransaction = async (_address, transaction) => {
    captured.push(transaction)
    return "0xhash"
  }
  const handler = createHandler(wallet)

  await handler(request("eth_sendTransaction", [{
    from: ADDRESS.toLowerCase(),
    to: ADDRESS,
    gas: "0x5208",
    value: "0x0"
  }]), { origin: ORIGIN })

  assert.deepEqual(captured, [{
    from: ADDRESS.toLowerCase(),
    to: ADDRESS,
    gas: "0x5208",
    value: "0x0"
  }])
})

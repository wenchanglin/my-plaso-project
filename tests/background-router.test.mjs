import test from "node:test"
import assert from "node:assert/strict"

import { createWalletMessageHandler } from "../src/background/router.ts"

const ORIGIN = "https://app.example"
const ACCOUNT = { address: "0xabc", name: "Account 1", index: 0 }

const request = (type, data) => ({
  from: "my-wallet-injected",
  type,
  requestId: "request-test",
  ...(data === undefined ? {} : { data })
})

const createFakeWallet = (overrides = {}) => {
  const connections = new Set(overrides.connections ?? [])
  return {
    gateway: {
      getCurrentAccount: async () =>
        overrides.account === undefined ? ACCOUNT : overrides.account,
      isUnlocked: async () => overrides.isUnlocked !== false,
      isConnected: async (origin) => connections.has(origin),
      connect: async (origin) => {
        connections.add(origin)
      },
      disconnect: async (origin) => {
        connections.delete(origin)
      },
      signMessage: async (address, message) => `signed:${address}:${message}`
    },
    connections
  }
}

const createHandler = (wallet, decision = { approved: true }) => {
  const prompts = []
  const handler = createWalletMessageHandler({
    requestAuthorization: async (walletRequest, context) => {
      prompts.push({ type: walletRequest.type, ...context })
      return decision
    },
    wallet: wallet.gateway
  })
  return { handler, prompts }
}

test("rejects a request with no reported origin", async () => {
  const wallet = createFakeWallet()
  const { handler } = createHandler(wallet)

  assert.deepEqual(await handler(request("WALLET_CONNECT"), { origin: "" }), {
    success: false,
    error: "Unknown request origin"
  })
})

test("connect prompts once and remembers the approved origin", async () => {
  const wallet = createFakeWallet()
  const { handler, prompts } = createHandler(wallet)

  const first = await handler(request("WALLET_CONNECT"), { origin: ORIGIN })
  const second = await handler(request("WALLET_CONNECT"), { origin: ORIGIN })

  assert.deepEqual(first, { success: true, data: { account: ACCOUNT } })
  assert.deepEqual(second, { success: true, data: { account: ACCOUNT } })
  assert.equal(prompts.length, 1)
  assert.deepEqual(prompts[0], { type: "WALLET_CONNECT", origin: ORIGIN })
})

test("connect surfaces a rejection and stores no connection", async () => {
  const wallet = createFakeWallet()
  const { handler } = createHandler(wallet, { approved: false })

  assert.deepEqual(await handler(request("WALLET_CONNECT"), { origin: ORIGIN }), {
    success: false,
    error: "User rejected authorization"
  })
  assert.equal(wallet.connections.has(ORIGIN), false)
})

test("connect asks the user to create a wallet first", async () => {
  const wallet = createFakeWallet({ account: null })
  const { handler, prompts } = createHandler(wallet)

  const response = await handler(request("WALLET_CONNECT"), { origin: ORIGIN })

  assert.equal(response.success, false)
  assert.match(response.error, /create or import/i)
  assert.equal(prompts.length, 0)
})

test("connect refuses to finish while the wallet stays locked", async () => {
  const wallet = createFakeWallet({ isUnlocked: false })
  const { handler } = createHandler(wallet)

  assert.deepEqual(await handler(request("WALLET_CONNECT"), { origin: ORIGIN }), {
    success: false,
    error: "Wallet is locked"
  })
})

test("getAccount only answers a connected origin", async () => {
  const wallet = createFakeWallet({ connections: [ORIGIN] })
  const { handler } = createHandler(wallet)

  assert.deepEqual(await handler(request("WALLET_GET_ACCOUNT"), { origin: ORIGIN }), {
    success: true,
    data: { account: ACCOUNT }
  })
  assert.deepEqual(
    await handler(request("WALLET_GET_ACCOUNT"), { origin: "https://evil.example" }),
    { success: false, error: "This site is not connected" }
  )
})

test("signMessage needs a connection, a message, and its own approval", async () => {
  const wallet = createFakeWallet({ connections: [ORIGIN] })
  const { handler, prompts } = createHandler(wallet)

  assert.deepEqual(await handler(request("WALLET_SIGN_MESSAGE"), { origin: ORIGIN }), {
    success: false,
    error: "Missing message to sign"
  })

  assert.deepEqual(
    await handler(request("WALLET_SIGN_MESSAGE", { message: "hi" }), {
      origin: "https://evil.example"
    }),
    { success: false, error: "This site is not connected" }
  )

  assert.deepEqual(
    await handler(request("WALLET_SIGN_MESSAGE", { message: "hi" }), { origin: ORIGIN }),
    { success: true, data: { signature: "signed:0xabc:hi", address: "0xabc" } }
  )
  assert.deepEqual(prompts, [
    { type: "WALLET_SIGN_MESSAGE", origin: ORIGIN, message: "hi" }
  ])
})

test("signMessage stops at a rejected prompt", async () => {
  const wallet = createFakeWallet({ connections: [ORIGIN] })
  const { handler } = createHandler(wallet, { approved: false })

  const response = await handler(request("WALLET_SIGN_MESSAGE", { message: "hi" }), {
    origin: ORIGIN
  })

  assert.equal(response.success, false)
  assert.match(response.error, /rejected the signature/i)
})

test("disconnect drops the stored origin", async () => {
  const wallet = createFakeWallet({ connections: [ORIGIN] })
  const { handler } = createHandler(wallet)

  assert.deepEqual(await handler(request("WALLET_DISCONNECT"), { origin: ORIGIN }), {
    success: true,
    data: true
  })
  assert.equal(wallet.connections.has(ORIGIN), false)
})

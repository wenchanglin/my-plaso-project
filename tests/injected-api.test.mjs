import test from "node:test"
import assert from "node:assert/strict"

import { createInjectedWallet } from "../src/bridge/injected-api.ts"

const createWindowMock = () => {
  const listeners = new Set()
  const messages = []

  return {
    messages,
    listeners,
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener)
    },
    postMessage(message) {
      messages.push(message)
    },
    dispatchMessage(data) {
      for (const listener of listeners) {
        listener({ source: this, data })
      }
    }
  }
}

test("connect resolves the correlated response and removes its listener", async () => {
  const target = createWindowMock()
  const wallet = createInjectedWallet(target, { timeoutMs: 50 })

  const pending = wallet.connect()
  assert.equal(target.messages.length, 1)
  assert.equal(target.messages[0].type, "WALLET_CONNECT")
  assert.equal(target.listeners.size, 1)

  target.dispatchMessage({
    from: "my-wallet-bridge",
    requestId: target.messages[0].requestId,
    success: true,
    data: { account: null, approved: true }
  })

  assert.deepEqual(await pending, { account: null, approved: true })
  assert.equal(target.listeners.size, 0)
})

test("request rejects after timeout and removes its listener", async () => {
  const target = createWindowMock()
  const wallet = createInjectedWallet(target, { timeoutMs: 5 })

  await assert.rejects(wallet.getAccount(), /timed out/i)
  assert.equal(target.listeners.size, 0)
})

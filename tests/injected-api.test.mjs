import test from "node:test"
import assert from "node:assert/strict"

import {
  createInjectedWallet,
  INTERACTIVE_TIMEOUT_MS,
  INTERACTIVE_TYPES
} from "../src/bridge/injected-api.ts"
import { DEFAULT_AUTHORIZATION_TIMEOUT_MS } from "../src/background/authorization.ts"

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

test("connect waits on its own ceiling, not the read one", async () => {
  const target = createWindowMock()
  const wallet = createInjectedWallet(target, {
    timeoutMs: 5,
    interactiveTimeoutMs: 60_000
  })

  // connect() blocks on a human clicking 确认, so the short ceiling must not
  // apply — the approval it abandons would still be honoured by the background.
  const pending = wallet.connect()
  await new Promise((resolve) => setTimeout(resolve, 40))
  target.dispatchMessage({
    from: "my-wallet-bridge",
    requestId: target.messages[0].requestId,
    success: true,
    data: { account: "0xabc", approved: true }
  })

  assert.deepEqual(await pending, { account: "0xabc", approved: true })
})

test("the interactive ceiling outlasts the background's approval wait", () => {
  assert.ok(INTERACTIVE_TIMEOUT_MS > DEFAULT_AUTHORIZATION_TIMEOUT_MS)
  assert.deepEqual([...INTERACTIVE_TYPES].sort(), [
    "WALLET_CONNECT",
    "WALLET_SIGN_MESSAGE"
  ])
})

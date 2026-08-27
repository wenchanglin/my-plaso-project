import test from "node:test"
import assert from "node:assert/strict"

import { handleWalletMessage } from "../src/bridge/message-bridge.ts"

const validMessage = {
  source: "window",
  data: {
    from: "my-wallet-injected",
    type: "WALLET_CONNECT",
    requestId: "request-1"
  }
}

test("ignores unrelated page messages", async () => {
  const forwarded = []
  const posted = []

  await handleWalletMessage(
    { ...validMessage, data: { hello: "page" } },
    async (message, callback) => callback({ data: {} }),
    (message) => posted.push(message),
    "window",
    forwarded
  )

  assert.equal(forwarded.length, 0)
  assert.equal(posted.length, 0)
})

test("forwards a valid request and posts a correlated response", async () => {
  const forwarded = []
  const posted = []

  await handleWalletMessage(
    validMessage,
    async (message, callback) => {
      forwarded.push(message)
      callback({ data: { approved: true } })
    },
    (message) => posted.push(message),
    "window",
    forwarded
  )

  assert.deepEqual(forwarded, [validMessage.data])
  assert.deepEqual(posted, [
    {
      from: "my-wallet-bridge",
      requestId: "request-1",
      success: true,
      data: { approved: true }
    }
  ])
})

test("serializes runtime errors into a failed response", async () => {
  const posted = []

  await handleWalletMessage(
    validMessage,
    async (message, callback) => {
      globalThis.chrome = { runtime: { lastError: { message: "bridge unavailable" } } }
      callback(undefined)
    },
    (message) => posted.push(message),
    "window"
  )

  assert.deepEqual(posted, [
    {
      from: "my-wallet-bridge",
      requestId: "request-1",
      success: false,
      error: "bridge unavailable"
    }
  ])
})

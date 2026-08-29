import test from "node:test"
import assert from "node:assert/strict"

import {
  createEthereumPortBroadcaster,
  createRuntimeMessageListener,
  readSenderOrigin
} from "../src/background/listener.ts"

test("leaves non-wallet messages for Plasmo messaging handlers", () => {
  let responded = false
  const listener = createRuntimeMessageListener(async () => ({ success: true }))

  const keepsChannelOpen = listener(
    { name: "getData", body: { id: 1 } },
    {},
    () => {
      responded = true
    }
  )

  assert.equal(keepsChannelOpen, false)
  assert.equal(responded, false)
})

test("keeps the response channel open for wallet messages", async () => {
  let response
  const listener = createRuntimeMessageListener(async () => ({
    success: true,
    data: { approved: true }
  }))

  const keepsChannelOpen = listener(
    {
      from: "my-wallet-injected",
      type: "WALLET_CONNECT",
      requestId: "request-1"
    },
    {},
    (value) => {
      response = value
    }
  )

  assert.equal(keepsChannelOpen, true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(response, { success: true, data: { approved: true } })
})

test("reads the origin from the sender instead of the message", () => {
  assert.equal(readSenderOrigin({ origin: "https://app.example" }), "https://app.example")
  assert.equal(
    readSenderOrigin({ url: "https://app.example/path?query=1" }),
    "https://app.example"
  )
  assert.equal(readSenderOrigin({ url: "not a url" }), "")
  assert.equal(readSenderOrigin(undefined), "")
})

test("passes the sender origin to the wallet handler", async () => {
  let received
  const listener = createRuntimeMessageListener(async (_message, context) => {
    received = context
    return { success: true }
  })

  listener(
    {
      from: "my-wallet-injected",
      type: "WALLET_CONNECT",
      requestId: "request-1"
    },
    { url: "https://app.example/dapp" },
    () => {}
  )

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(received, { origin: "https://app.example" })
})

test("broadcasts public events only to ports from the matching origin", () => {
  const listeners = new Set()
  const makePort = (origin) => ({
    name: "ethereum-events",
    sender: { origin },
    messages: [],
    onDisconnect: {
      addListener: (listener) => listeners.add(listener)
    },
    postMessage(message) {
      this.messages.push(message)
    }
  })
  const matching = makePort("https://app.example")
  const other = makePort("https://other.example")
  const broadcaster = createEthereumPortBroadcaster()

  broadcaster.addPort(matching)
  broadcaster.addPort(other)
  broadcaster.broadcast("https://app.example", "accountsChanged", ["0xabc"])

  assert.equal(matching.messages.length, 1)
  assert.equal(other.messages.length, 0)
})

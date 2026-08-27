import test from "node:test"
import assert from "node:assert/strict"

import {
  WALLET_MESSAGE_TYPES,
  createRequestId,
  isWalletMessageType,
  isWalletRequest
} from "../src/bridge/protocol.ts"

test("accepts the four supported wallet message types", () => {
  for (const type of WALLET_MESSAGE_TYPES) {
    assert.equal(isWalletMessageType(type), true)
    assert.equal(
      isWalletRequest({
        from: "my-wallet-injected",
        type,
        requestId: "request-1"
      }),
      true
    )
  }
})

test("rejects malformed or unknown wallet messages", () => {
  assert.equal(isWalletMessageType("WALLET_UNKNOWN"), false)
  assert.equal(isWalletRequest(null), false)
  assert.equal(
    isWalletRequest({
      from: "other-script",
      type: "WALLET_CONNECT",
      requestId: "request-1"
    }),
    false
  )
  assert.equal(
    isWalletRequest({
      from: "my-wallet-injected",
      type: "WALLET_CONNECT",
      requestId: ""
    }),
    false
  )
})

test("creates non-empty request IDs", () => {
  const first = createRequestId()
  const second = createRequestId()

  assert.match(first, /^[a-z0-9-]+$/)
  assert.notEqual(first, second)
})

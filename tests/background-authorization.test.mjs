import test from "node:test"
import assert from "node:assert/strict"

import { createAuthorizationRequester } from "../src/background/authorization.ts"

const request = (type = "WALLET_CONNECT", data) => ({
  from: "my-wallet-injected",
  type,
  requestId: "request-1",
  ...(data === undefined ? {} : { data })
})

const createGateway = (decision) => {
  const events = { pending: [], cleared: 0, popups: 0, waits: [] }
  return {
    events,
    gateway: {
      writePending: async (pending) => {
        events.pending.push(pending)
      },
      clearPending: async () => {
        events.cleared += 1
      },
      openPopup: async () => {
        events.popups += 1
      },
      waitForDecision: async (decisionKey, timeoutMs) => {
        events.waits.push({ decisionKey, timeoutMs })
        return decision
      }
    }
  }
}

test("publishes the request, opens the popup, and returns the approval", async () => {
  const { events, gateway } = createGateway({ approved: true })
  const requestAuthorization = createAuthorizationRequester(gateway, 1000)

  const result = await requestAuthorization(request(), { origin: "https://app.example" })

  assert.deepEqual(result, { approved: true })
  assert.deepEqual(events.pending, [
    {
      requestId: "request-1",
      decisionKey: "wallet-decision-request-1",
      type: "WALLET_CONNECT",
      origin: "https://app.example"
    }
  ])
  assert.equal(events.popups, 1)
  assert.deepEqual(events.waits, [
    { decisionKey: "wallet-decision-request-1", timeoutMs: 1000 }
  ])
  assert.equal(events.cleared, 1)
})

test("passes the message to sign so the popup can display it", async () => {
  const { events, gateway } = createGateway({ approved: true })
  const requestAuthorization = createAuthorizationRequester(gateway)

  await requestAuthorization(request("WALLET_SIGN_MESSAGE", { message: "hi" }), {
    origin: "https://app.example",
    message: "hi"
  })

  assert.equal(events.pending[0].message, "hi")
})

test("treats a timeout as a rejection and still clears the pending request", async () => {
  const { events, gateway } = createGateway(null)
  const requestAuthorization = createAuthorizationRequester(gateway, 5)

  assert.deepEqual(
    await requestAuthorization(request(), { origin: "https://app.example" }),
    { approved: false }
  )
  assert.equal(events.cleared, 1)
})

test("clears the pending request when opening the popup fails", async () => {
  const { events, gateway } = createGateway({ approved: true })
  gateway.openPopup = async () => {
    throw new Error("no window")
  }
  const requestAuthorization = createAuthorizationRequester(gateway)

  await assert.rejects(
    () => requestAuthorization(request(), { origin: "https://app.example" }),
    /no window/
  )
  assert.equal(events.cleared, 1)
})

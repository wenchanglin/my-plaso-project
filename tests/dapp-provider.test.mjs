import test from "node:test"
import assert from "node:assert/strict"

import { createDappProvider } from "../src/services/dappProvider.ts"

const createTarget = () => {
  const listeners = new Map()
  const messages = []
  return {
    messages,
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    postMessage(message) {
      messages.push(message)
    },
    dispatch(data) {
      for (const listener of listeners.get("message") ?? []) {
        listener({ source: this, data })
      }
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event)
      return true
    }
  }
}

test("provider implements request and legacy send overloads", async () => {
  const target = createTarget()
  const provider = createDappProvider(target, { timeoutMs: 50 })

  const pending = provider.request({ method: "eth_chainId" })
  const request = target.messages[0]
  assert.equal(request.type, "ETHEREUM_REQUEST")
  assert.deepEqual(request.data, { method: "eth_chainId", params: [] })
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: request.requestId,
    success: true,
    data: "0xaa36a7"
  })
  assert.equal(await pending, "0xaa36a7")

  const legacy = provider.send("eth_chainId", [])
  const legacyRequest = target.messages[1]
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: legacyRequest.requestId,
    success: true,
    data: "0xaa36a7"
  })
  assert.equal(await legacy, "0xaa36a7")
})

test("provider exposes MetaMask fields and normalizes personal_sign ordering", async () => {
  const target = createTarget()
  const provider = createDappProvider(target)

  assert.equal(provider.isMetaMask, true)
  assert.equal(provider.selectedAddress, null)
  assert.equal(provider.chainId, null)

  const pending = provider.request({
    method: "personal_sign",
    params: ["0x6869", "0xABC"]
  })
  assert.deepEqual(target.messages[0].data, {
    method: "personal_sign",
    params: ["0x6869", "0xABC"]
  })
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: target.messages[0].requestId,
    success: false,
    error: { code: 4001, message: "User rejected" }
  })
  await assert.rejects(pending, (error) => error.code === 4001)
})

test("_metamask.isUnlocked delegates to the wallet instead of returning a constant", async () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  const pending = provider._metamask.isUnlocked()
  const request = target.messages[0]
  assert.equal(request.data.method, "wallet_isUnlocked")
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: request.requestId,
    success: true,
    data: true
  })
  assert.equal(await pending, true)
})

test("provider emits EIP-6963 announcement and event listeners can be removed", () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  const announcements = []
  target.addEventListener("eip6963:announceProvider", (event) => announcements.push(event.detail))
  target.dispatchEvent(new Event("eip6963:requestProvider"))
  assert.equal(announcements.length, 1)
  assert.equal(announcements[0].provider, provider)
  assert.equal(typeof announcements[0].info.uuid, "string")

  const changes = []
  const listener = (accounts) => changes.push(accounts)
  provider.on("accountsChanged", listener)
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "accountsChanged",
    data: ["0xabc"]
  })
  provider.removeListener("accountsChanged", listener)
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "accountsChanged",
    data: []
  })
  assert.deepEqual(changes, [["0xabc"]])
})

test("does not duplicate connection events when the background event arrives first", async () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  const events = []
  provider.on("accountsChanged", (accounts) => events.push(["accountsChanged", accounts]))
  provider.on("connect", (info) => events.push(["connect", info]))

  const pending = provider.request({ method: "eth_requestAccounts" })
  const request = target.messages[0]
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "accountsChanged",
    data: ["0xabc"]
  })
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "connect",
    data: { chainId: "0xaa36a7" }
  })
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: request.requestId,
    success: true,
    data: ["0xabc"]
  })

  assert.deepEqual(await pending, ["0xabc"])
  assert.deepEqual(events, [
    ["accountsChanged", ["0xabc"]],
    ["connect", { chainId: "0xaa36a7" }]
  ])
  assert.equal(provider.chainId, "0xaa36a7")
  assert.equal(provider.networkVersion, "11155111")
})

test("supports callback form of legacy send", async () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  let callbackResult
  provider.send("eth_chainId", [], (error, response) => {
    callbackResult = { error, response }
  })
  const request = target.messages[0]
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: request.requestId,
    success: true,
    data: "0xaa36a7"
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(callbackResult, {
    error: null,
    response: { jsonrpc: "2.0", result: "0xaa36a7" }
  })
})

test("deduplicates a background event that follows the request response", async () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  const events = []
  provider.on("accountsChanged", (accounts) => events.push(accounts))

  const pending = provider.request({ method: "eth_requestAccounts" })
  const request = target.messages[0]
  target.dispatch({
    from: "my-wallet-bridge",
    requestId: request.requestId,
    success: true,
    data: ["0xabc"]
  })
  await pending
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "accountsChanged",
    data: ["0xabc"]
  })

  assert.deepEqual(events, [["0xabc"]])
})

test("emits disconnect after accountsChanged clears the connected account", () => {
  const target = createTarget()
  const provider = createDappProvider(target)
  const events = []
  provider.on("disconnect", (error) => events.push(error))

  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "connect",
    data: { chainId: "0xaa36a7" }
  })
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "accountsChanged",
    data: []
  })
  target.dispatch({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "disconnect",
    data: { code: 4900, message: "Disconnected" }
  })

  assert.deepEqual(events, [{ code: 4900, message: "Disconnected" }])
})

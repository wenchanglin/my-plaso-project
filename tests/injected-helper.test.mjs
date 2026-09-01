import test from "node:test"
import assert from "node:assert/strict"

import { injectMyWallet } from "../src/background/injected-helper.ts"

// `window.ethereum` is a single global that every installed wallet writes at
// document_start, so these tests pin the two things that decide whether a dapp
// reaches this wallet at all: who ends up owning the global, and whether the
// EIP-6963 announcement happens even when someone else owns it.

const createPage = () => {
  const listeners = new Map()
  const events = []
  const messages = []
  return {
    events,
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
    /** What the content-script bridge does when it answers. */
    dispatchMessage(data) {
      for (const listener of listeners.get("message") ?? []) {
        listener({ source: this, data })
      }
    },
    dispatchEvent(event) {
      events.push(event)
      for (const listener of listeners.get(event.type) ?? []) listener(event)
      return true
    }
  }
}

const announcements = (page) =>
  page.events.filter((event) => event.type === "eip6963:announceProvider")

const otherWallet = { isMetaMask: true, isMyWallet: false, request: async () => [] }

test("claims a free window.ethereum and signals readiness", async () => {
  const page = createPage()
  injectMyWallet(page, { takeOver: false })
  await Promise.resolve()

  assert.equal(page.ethereum.isMyWallet, true)
  assert.ok(page.myWallet, "the typed request API is missing")
  assert.equal(
    page.events.filter((event) => event.type === "ethereum#initialized").length,
    1
  )
  assert.equal(announcements(page).length, 1)
})

test("announces over EIP-6963 even when another wallet owns the global", async () => {
  const page = createPage()
  page.ethereum = otherWallet
  injectMyWallet(page, { takeOver: false })
  await Promise.resolve()

  // Yielding the global must not mean disappearing: an earlier version skipped
  // building the provider entirely, so a 6963-aware dapp could not list this
  // wallet next to the one that won the race.
  assert.equal(page.ethereum, otherWallet)
  const [announced] = announcements(page)
  assert.ok(announced, "no EIP-6963 announcement was dispatched")
  assert.equal(announced.detail.provider.isMyWallet, true)
  assert.equal(announced.detail.info.rdns, "com.mywallet")
})

test("takeOver wins the global and parks the wallet it displaced", async () => {
  const page = createPage()
  page.ethereum = otherWallet
  injectMyWallet(page, { takeOver: true })

  assert.equal(page.ethereum.isMyWallet, true)
  assert.equal(page.myWalletShadowed, otherWallet)
})

test("takeOver holds the global against a wallet that injects later", () => {
  const page = createPage()
  injectMyWallet(page, { takeOver: true })

  // MetaMask's `setGlobalProvider` is a plain assignment. It must neither throw
  // — that would land inside its own initialization — nor take the global.
  assert.doesNotThrow(() => {
    page.ethereum = otherWallet
  })
  assert.equal(page.ethereum.isMyWallet, true)
  assert.equal(page.myWalletShadowed, otherWallet)
})

test("a locked global is reported, not fatal", async () => {
  const page = createPage()
  Object.defineProperty(page, "ethereum", {
    configurable: false,
    writable: false,
    value: otherWallet
  })

  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    assert.doesNotThrow(() => injectMyWallet(page, { takeOver: true }))
  } finally {
    console.warn = warn
  }
  await Promise.resolve()

  assert.equal(page.ethereum, otherWallet)
  assert.equal(warnings.length, 1)
  // The wallet is still discoverable, which is the whole point of announcing.
  assert.equal(announcements(page).length, 1)
})

test("running twice leaves one provider and one announcement", async () => {
  const page = createPage()
  injectMyWallet(page, { takeOver: false })
  const provider = page.ethereum
  injectMyWallet(page, { takeOver: false })
  await Promise.resolve()

  assert.equal(page.ethereum, provider)
  assert.equal(announcements(page).length, 1)
})

// `window.ethereum` may be MetaMask's and EIP-6963 needs the dapp to cooperate,
// so `window.myWallet` is the one name that always reaches this wallet — which
// is only useful if it speaks EIP-1193 too.
test("window.myWallet.request answers eth_requestAccounts", async () => {
  const page = createPage()
  page.ethereum = otherWallet
  injectMyWallet(page, { takeOver: false })

  const pending = page.myWallet.request({ method: "eth_requestAccounts" })
  const sent = page.messages.at(-1)
  assert.equal(sent.type, "ETHEREUM_REQUEST")
  assert.deepEqual(sent.data, { method: "eth_requestAccounts", params: [] })

  page.dispatchMessage({
    from: "my-wallet-bridge",
    requestId: sent.requestId,
    success: true,
    data: ["0xabc"]
  })

  assert.deepEqual(await pending, ["0xabc"])
  // The same request that window.ethereum would make, not a second code path.
  assert.equal(page.myWallet.request, page.myWalletProvider.request)
  assert.equal(page.myWallet.provider, page.myWalletProvider)
})

test("window.myWallet keeps the transport calls and gains the event methods", () => {
  const page = createPage()
  injectMyWallet(page, { takeOver: false })

  for (const method of [
    "connect",
    "getAccount",
    "signMessage",
    "disconnect",
    "request",
    "on",
    "once",
    "off",
    "removeListener"
  ]) {
    assert.equal(typeof page.myWallet[method], "function", method)
  }

  // Listening through myWallet must reach the provider's own emitter.
  const seen = []
  page.myWallet.on("chainChanged", (chainId) => seen.push(chainId))
  page.dispatchMessage({
    from: "my-wallet-background",
    type: "ETHEREUM_EVENT",
    event: "chainChanged",
    data: "0xaa36a7"
  })

  assert.deepEqual(seen, ["0xaa36a7"])
})

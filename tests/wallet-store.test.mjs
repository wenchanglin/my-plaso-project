import test from "node:test"
import assert from "node:assert/strict"
import { verifyMessage } from "ethers"

import { installChromeStub } from "./chrome-stub.mjs"

// The store creates its persist middleware on import, so the stub must exist first.
const chromeStub = installChromeStub()
const { useWalletStore, WALLET_STORAGE_KEY, selectCurrentAccount } = await import(
  "../src/stores/walletStore.ts"
)

const PASSWORD = "correct horse battery staple"

const flushPersist = () => new Promise((resolve) => setTimeout(resolve, 0))

const reset = () => {
  chromeStub.reset()
  useWalletStore.setState({
    vault: null,
    accounts: [],
    currentAddress: null,
    connections: [],
    isUnlocked: false
  })
}

test("starts locked with no vault", () => {
  reset()
  const state = useWalletStore.getState()

  assert.equal(state.isUnlocked, false)
  assert.equal(state.vault, null)
  assert.equal(selectCurrentAccount(state), null)
})

test("persists only encrypted material, never the key or password", async () => {
  reset()
  const { mnemonic, account } = await useWalletStore.getState().createWallet(PASSWORD)
  await flushPersist()

  const persisted = JSON.stringify(chromeStub.local.get(WALLET_STORAGE_KEY))

  assert.equal(persisted.includes(mnemonic), false)
  assert.equal(persisted.includes(PASSWORD), false)
  assert.equal(persisted.includes("privateKey"), false)
  assert.equal(persisted.includes(account.address), true)
})

test("keeps the unlock key in session storage only", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)
  await flushPersist()

  assert.equal(chromeStub.session.size, 1)
  assert.equal(
    JSON.stringify(chromeStub.local.get(WALLET_STORAGE_KEY)).includes("isUnlocked"),
    false
  )
})

test("unlocks with the right password and refuses the wrong one", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)
  await useWalletStore.getState().lock()

  assert.equal(useWalletStore.getState().isUnlocked, false)
  assert.equal(await useWalletStore.getState().unlock("wrong password"), false)
  assert.equal(useWalletStore.getState().isUnlocked, false)
  assert.equal(await useWalletStore.getState().unlock(PASSWORD), true)
  assert.equal(useWalletStore.getState().isUnlocked, true)
})

test("cannot sign while locked", async () => {
  reset()
  const { account } = await useWalletStore.getState().createWallet(PASSWORD)
  await useWalletStore.getState().lock()

  await assert.rejects(
    () => useWalletStore.getState().signMessageFor(account.address, "hello"),
    /Wallet is locked/
  )
})

test("signs with the stored account after unlocking", async () => {
  reset()
  const { account } = await useWalletStore.getState().createWallet(PASSWORD)

  const signature = await useWalletStore.getState().signMessageFor(account.address, "hello")

  assert.equal(verifyMessage("hello", signature), account.address)
})

test("derives additional accounts from the stored phrase", async () => {
  reset()
  const { account } = await useWalletStore.getState().createWallet(PASSWORD)
  const second = await useWalletStore.getState().createAccount()

  assert.notEqual(second.address, account.address)
  assert.equal(second.index, 1)
  assert.equal(useWalletStore.getState().accounts.length, 2)
  assert.equal(selectCurrentAccount(useWalletStore.getState()).address, second.address)
})

test("tracks connected origins instead of one global flag", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)

  useWalletStore.getState().connect("https://app.example")
  useWalletStore.getState().connect("https://app.example")

  assert.deepEqual(useWalletStore.getState().connections, ["https://app.example"])

  useWalletStore.getState().disconnect("https://app.example")

  assert.deepEqual(useWalletStore.getState().connections, [])
})

test("refuses to overwrite an existing wallet", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)

  await assert.rejects(
    () => useWalletStore.getState().createWallet("another password"),
    /already exists/
  )
})

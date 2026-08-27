import test from "node:test"
import assert from "node:assert/strict"
import { verifyMessage } from "ethers"

import { installChromeStub } from "./chrome-stub.mjs"

// The store creates its persist middleware on import, so the stub must exist first.
const chromeStub = installChromeStub()
const { useWalletStore, WALLET_STORAGE_KEY, selectCurrentAccount, selectPublicAccounts } =
  await import("../src/stores/walletStore.ts")

const PASSWORD = "correct horse battery staple"

const flushPersist = () => new Promise((resolve) => setTimeout(resolve, 0))

const reset = () => {
  chromeStub.reset()
  useWalletStore.setState({
    vault: null,
    accounts: [],
    currentAddress: null,
    connections: [],
    isUnlocked: false,
    pendingBackup: null
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

// zustand v5 compares snapshots with Object.is, so a selector that rebuilt its
// result on every call re-rendered the popup until React threw.
test("account selectors keep the same reference until accounts change", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)

  const state = useWalletStore.getState()
  assert.equal(selectPublicAccounts(state), selectPublicAccounts(state))
  assert.equal(selectCurrentAccount(state), selectCurrentAccount(state))

  await useWalletStore.getState().createAccount()
  const next = useWalletStore.getState()

  assert.notEqual(selectPublicAccounts(next), selectPublicAccounts(state))
  assert.equal(selectPublicAccounts(next).length, 2)
})

test("hands the new phrase over for backup without persisting it", async () => {
  reset()
  const { mnemonic } = await useWalletStore.getState().createWallet(PASSWORD)
  await flushPersist()

  assert.equal(useWalletStore.getState().pendingBackup, mnemonic)
  assert.equal(
    JSON.stringify(chromeStub.local.get(WALLET_STORAGE_KEY)).includes("pendingBackup"),
    false
  )

  useWalletStore.getState().clearPendingBackup()
  assert.equal(useWalletStore.getState().pendingBackup, null)
})

test("importing a phrase asks for no backup, the user already has it", async () => {
  reset()
  await useWalletStore
    .getState()
    .importMnemonic(
      "test test test test test test test test test test test junk",
      PASSWORD
    )

  assert.equal(useWalletStore.getState().pendingBackup, null)
})

import test from "node:test"
import assert from "node:assert/strict"
import { verifyMessage, verifyTypedData, Wallet } from "ethers"

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

test("signs typed data with the stored account after unlocking", async () => {
  reset()
  const { account } = await useWalletStore.getState().createWallet(PASSWORD)
  const domain = { name: "My Wallet", version: "1", chainId: 11155111 }
  const types = { Mail: [{ name: "contents", type: "string" }] }
  const value = { contents: "hello" }

  const signature = await useWalletStore
    .getState()
    .signTypedDataFor(account.address, domain, types, value)

  assert.equal(verifyTypedData(domain, types, value, signature), account.address)
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

// The private-key tab on the setup screen builds a vault with no phrase in it.
test("a wallet imported from a private key has no recovery phrase", async () => {
  reset()
  const account = await useWalletStore
    .getState()
    .createWalletFromPrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      PASSWORD
    )

  const state = useWalletStore.getState()
  assert.equal(account.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
  assert.equal(state.isUnlocked, true)
  assert.equal(state.vault.encryptedMnemonic, null)
  assert.equal(state.pendingBackup, null)

  await assert.rejects(
    () => useWalletStore.getState().createAccount(),
    /no recovery phrase/
  )
})

test("resetting drops the vault, the accounts and the session key", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)
  useWalletStore.getState().connect("https://app.example")
  await flushPersist()

  await useWalletStore.getState().resetWallet()
  await flushPersist()

  const state = useWalletStore.getState()
  assert.equal(state.vault, null)
  assert.deepEqual(state.accounts, [])
  assert.equal(state.currentAddress, null)
  assert.deepEqual(state.connections, [])
  assert.equal(state.isUnlocked, false)
  assert.equal(state.pendingBackup, null)
  assert.equal(chromeStub.session.size, 0)

  const persisted = JSON.stringify(chromeStub.local.get(WALLET_STORAGE_KEY))
  assert.equal(persisted.includes("https://app.example"), false)
})

// The setup screen is chosen on `vault === null`, so a reset has to land there.
test("resetting allows creating a fresh wallet", async () => {
  reset()
  await useWalletStore.getState().createWallet(PASSWORD)
  await useWalletStore.getState().resetWallet()

  const { account } = await useWalletStore.getState().createWallet("another one")
  assert.equal(useWalletStore.getState().accounts.length, 1)
  assert.equal(useWalletStore.getState().currentAddress, account.address)
})

test("a private-key wallet still signs, and refuses a second vault", async () => {
  reset()
  const account = await useWalletStore
    .getState()
    .createWalletFromPrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      PASSWORD
    )

  const signature = await useWalletStore
    .getState()
    .signMessageFor(account.address, "hello")
  assert.equal(verifyMessage("hello", signature), account.address)

  await assert.rejects(
    () => useWalletStore.getState().createWallet(PASSWORD),
    /already exists/
  )
})

test("exports the phrase and the key that were stored", async () => {
  reset()
  const { mnemonic, account } = await useWalletStore.getState().createWallet(PASSWORD)

  assert.equal(await useWalletStore.getState().exportMnemonic(PASSWORD), mnemonic)

  const privateKey = await useWalletStore
    .getState()
    .exportPrivateKey(account.address, PASSWORD)
  assert.equal(new Wallet(privateKey).address, account.address)
})

test("exporting needs the password, not just an unlocked wallet", async () => {
  reset()
  const { account } = await useWalletStore.getState().createWallet(PASSWORD)

  assert.equal(useWalletStore.getState().isUnlocked, true)
  await assert.rejects(
    () => useWalletStore.getState().exportMnemonic("wrong password"),
    /Wrong password/
  )
  await assert.rejects(
    () => useWalletStore.getState().exportPrivateKey(account.address, "wrong password"),
    /Wrong password/
  )
})

// The password is re-derived from the vault meta, so revealing a secret neither
// needs nor produces a session key.
test("exporting leaves the lock state alone", async () => {
  reset()
  const { mnemonic } = await useWalletStore.getState().createWallet(PASSWORD)
  await useWalletStore.getState().lock()

  assert.equal(await useWalletStore.getState().exportMnemonic(PASSWORD), mnemonic)
  assert.equal(useWalletStore.getState().isUnlocked, false)
  assert.equal(chromeStub.session.size, 0)
})

test("refuses to export what the wallet does not hold", async () => {
  reset()
  const account = await useWalletStore
    .getState()
    .createWalletFromPrivateKey(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      PASSWORD
    )

  await assert.rejects(
    () => useWalletStore.getState().exportMnemonic(PASSWORD),
    /no recovery phrase/
  )
  await assert.rejects(
    () => useWalletStore.getState().exportPrivateKey("0xdead", PASSWORD),
    /Unknown account/
  )
  assert.equal(
    await useWalletStore.getState().exportPrivateKey(account.address, PASSWORD),
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  )
})

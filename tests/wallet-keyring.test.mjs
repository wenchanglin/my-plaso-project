import test from "node:test"
import assert from "node:assert/strict"

import {
  accountFromPrivateKey,
  createMnemonic,
  deriveAccount,
  isValidMnemonic,
  signMessage
} from "../src/lib/keyring.ts"
import { verifyMessage } from "ethers"

// Fixed vector from the BIP-39 test suite so derivation stays stable.
const PHRASE =
  "test test test test test test test test test test test junk"

test("generates a valid 12-word mnemonic", () => {
  const phrase = createMnemonic()

  assert.equal(phrase.split(" ").length, 12)
  assert.equal(isValidMnemonic(phrase), true)
  assert.equal(isValidMnemonic("not really a mnemonic phrase at all"), false)
})

test("derives distinct accounts along the BIP-44 path", () => {
  const first = deriveAccount(PHRASE, 0)
  const second = deriveAccount(PHRASE, 1)

  assert.equal(first.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
  assert.notEqual(first.address, second.address)
  assert.equal(deriveAccount(PHRASE, 0).address, first.address)
})

test("rejects an invalid mnemonic instead of deriving a wrong account", () => {
  assert.throws(() => deriveAccount("clearly invalid phrase", 0), /Invalid mnemonic/)
})

test("imports a private key and rejects malformed input", () => {
  const derived = deriveAccount(PHRASE, 0)

  assert.equal(accountFromPrivateKey(derived.privateKey).address, derived.address)
  assert.throws(() => accountFromPrivateKey("0xnope"), /Invalid private key/)
})

test("produces a signature that recovers to the signing address", async () => {
  const account = deriveAccount(PHRASE, 0)
  const signature = await signMessage(account.privateKey, "hello wallet")

  assert.equal(verifyMessage("hello wallet", signature), account.address)
})

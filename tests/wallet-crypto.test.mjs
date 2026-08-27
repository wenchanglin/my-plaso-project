import test from "node:test"
import assert from "node:assert/strict"

import {
  createVaultMeta,
  decrypt,
  encrypt,
  unlockKey
} from "../src/lib/crypto.ts"

test("derives a key only for the correct password", async () => {
  const { meta, key } = await createVaultMeta("correct horse")

  assert.equal(await unlockKey("correct horse", meta), key)
  assert.equal(await unlockKey("wrong password", meta), null)
})

test("never stores the derived key inside the vault metadata", async () => {
  const { meta, key } = await createVaultMeta("correct horse")

  assert.notEqual(meta.verifier, key)
  assert.equal(JSON.stringify(meta).includes(key), false)
})

test("round-trips secrets and rejects a foreign key", async () => {
  const { key } = await createVaultMeta("correct horse")
  const other = await createVaultMeta("another password")

  const payload = await encrypt("secret mnemonic words", key)

  assert.notEqual(payload, "secret mnemonic words")
  assert.equal(await decrypt(payload, key), "secret mnemonic words")
  await assert.rejects(() => decrypt(payload, other.key), /Unable to decrypt/)
})

test("uses a fresh IV so equal plaintexts produce different ciphertexts", async () => {
  const { key } = await createVaultMeta("correct horse")

  assert.notEqual(await encrypt("same", key), await encrypt("same", key))
})

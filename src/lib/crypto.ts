/**
 * Vault cryptography built on WebCrypto, which is available in the popup and in
 * the MV3 service worker without any dependency or polyfill.
 *
 * Two properties matter for a wallet vault:
 * 1. The password is stretched with PBKDF2-SHA256 and a per-vault salt, so a
 *    copy of the stored data cannot be attacked with plain hash lookups.
 * 2. Only the derived key encrypts secrets. The key itself is never persisted;
 *    the vault stores a `verifier` digest that proves a password is correct.
 *
 * AES-GCM is authenticated, so a wrong key fails loudly instead of returning
 * silent garbage.
 */
export const PBKDF2_ITERATIONS = 250_000

const KEY_LENGTH_BITS = 256
const IV_LENGTH_BYTES = 12
const SALT_LENGTH_BYTES = 16
const VERIFIER_INFO = "my-wallet:verifier:v1"

export interface VaultMeta {
  /** Hex-encoded PBKDF2 salt. */
  salt: string
  iterations: number
  /** Digest of the derived key, used to validate a password offline. */
  verifier: string
}

const subtle = (): SubtleCrypto => {
  const webcrypto = globalThis.crypto
  if (!webcrypto?.subtle) {
    throw new Error("WebCrypto is unavailable in this context")
  }
  return webcrypto.subtle
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const fromHex = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string")
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export const createSalt = (): string =>
  toHex(globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES)))

/** Stretches a password into a hex-encoded AES-GCM key. */
export const deriveKey = async (
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> => {
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )

  const bits = await subtle().deriveBits(
    { name: "PBKDF2", salt: fromHex(salt), iterations, hash: "SHA-256" },
    material,
    KEY_LENGTH_BITS
  )

  return toHex(new Uint8Array(bits))
}

export const computeVerifier = async (keyHex: string): Promise<string> => {
  const digest = await subtle().digest(
    "SHA-256",
    new TextEncoder().encode(`${VERIFIER_INFO}:${keyHex}`)
  )
  return toHex(new Uint8Array(digest))
}

export const createVaultMeta = async (
  password: string
): Promise<{ meta: VaultMeta; key: string }> => {
  const salt = createSalt()
  const key = await deriveKey(password, salt)
  return {
    meta: { salt, iterations: PBKDF2_ITERATIONS, verifier: await computeVerifier(key) },
    key
  }
}

/** Returns the derived key when the password matches, otherwise null. */
export const unlockKey = async (
  password: string,
  meta: VaultMeta
): Promise<string | null> => {
  const key = await deriveKey(password, meta.salt, meta.iterations)
  return (await computeVerifier(key)) === meta.verifier ? key : null
}

const importAesKey = (keyHex: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> =>
  subtle().importKey("raw", fromHex(keyHex), "AES-GCM", false, [usage])

export const encrypt = async (plaintext: string, keyHex: string): Promise<string> => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv },
    await importAesKey(keyHex, "encrypt"),
    new TextEncoder().encode(plaintext)
  )

  const payload = new Uint8Array(iv.length + ciphertext.byteLength)
  payload.set(iv, 0)
  payload.set(new Uint8Array(ciphertext), iv.length)
  return toBase64(payload)
}

export const decrypt = async (payload: string, keyHex: string): Promise<string> => {
  const bytes = fromBase64(payload)
  try {
    const plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, IV_LENGTH_BYTES) },
      await importAesKey(keyHex, "decrypt"),
      bytes.slice(IV_LENGTH_BYTES)
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error("Unable to decrypt vault data")
  }
}

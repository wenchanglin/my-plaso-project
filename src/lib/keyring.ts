/**
 * Key derivation and signing.
 *
 * The reference project used `bip39` plus `crypto-js`, which needs a Buffer
 * polyfill inside the extension bundle. ethers v6 already ships BIP-39 and
 * BIP-44 support, so this module keeps one dependency and no polyfill.
 *
 * Every function here is pure: it takes plaintext key material as an argument
 * and returns a result. Nothing is stored, so the caller decides how long a
 * decrypted secret stays in memory.
 */
import { HDNodeWallet, Mnemonic, Wallet, randomBytes } from "ethers"

/** BIP-44 account branch for Ethereum. */
export const DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0"

export interface DerivedKey {
  address: string
  privateKey: string
}

/** 128 bits of entropy, i.e. a 12-word phrase. */
export const createMnemonic = (): string =>
  Mnemonic.fromEntropy(randomBytes(16)).phrase

export const isValidMnemonic = (phrase: string): boolean =>
  Mnemonic.isValidMnemonic(phrase.trim())

export const deriveAccount = (phrase: string, index: number): DerivedKey => {
  if (!isValidMnemonic(phrase)) {
    throw new Error("Invalid mnemonic phrase")
  }

  const wallet = HDNodeWallet.fromPhrase(
    phrase.trim(),
    "",
    `${DERIVATION_PATH_PREFIX}/${index}`
  )
  return { address: wallet.address, privateKey: wallet.privateKey }
}

export const accountFromPrivateKey = (privateKey: string): DerivedKey => {
  try {
    const wallet = new Wallet(privateKey.trim())
    return { address: wallet.address, privateKey: wallet.privateKey }
  } catch {
    throw new Error("Invalid private key")
  }
}

export const signMessage = (privateKey: string, message: string): Promise<string> =>
  new Wallet(privateKey).signMessage(message)

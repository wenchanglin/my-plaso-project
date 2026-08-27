/**
 * Wallet state, persisted to `chrome.storage.local` through zustand's persist
 * middleware so the popup and the service worker read one source of truth.
 *
 * How this differs from the reference implementation it was ported from:
 * - No plaintext private key is ever stored. `StoredAccount` only carries an
 *   AES-GCM ciphertext, and the store returns public `WalletAccount` objects.
 * - The password is not stored at all, hashed or otherwise. Unlocking derives a
 *   key (PBKDF2) and keeps it in `chrome.storage.session`, which is memory-only
 *   and unreachable from content scripts.
 * - The wallet starts locked, and `lock()` drops the session key, so signing
 *   becomes impossible until the user types the password again.
 * - `connect()` records an approved origin instead of a single global
 *   `isConnected` flag, and it is the background service worker (never a page)
 *   that decides when to call it.
 */
import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"

import {
  createVaultMeta,
  decrypt,
  encrypt,
  unlockKey,
  type VaultMeta
} from "../lib/crypto.ts"
import {
  accountFromPrivateKey,
  createMnemonic,
  deriveAccount,
  signMessage
} from "../lib/keyring.ts"
import { clearSessionKey, readSessionKey, writeSessionKey } from "../lib/session.ts"
import {
  DEFAULT_NETWORKS,
  type Network,
  type StoredAccount,
  type WalletAccount
} from "../types/wallet.ts"

export const WALLET_STORAGE_KEY = "wallet-store"

export interface WalletVault {
  meta: VaultMeta
  /** Null when the wallet was created from a bare private key. */
  encryptedMnemonic: string | null
}

/** The subset of the store that is written to disk. */
export interface WalletData {
  vault: WalletVault | null
  accounts: StoredAccount[]
  currentAddress: string | null
  networks: Network[]
  currentNetworkId: string
  /** Origins the user approved, e.g. `https://app.uniswap.org`. */
  connections: string[]
}

export interface WalletStore extends WalletData {
  isUnlocked: boolean
  /**
   * Phrase awaiting the user's acknowledgement, held in memory only: it is
   * readable exactly once, right after creation, and is never persisted.
   */
  pendingBackup: string | null

  createWallet: (password: string) => Promise<{ mnemonic: string; account: WalletAccount }>
  importMnemonic: (phrase: string, password: string) => Promise<WalletAccount>
  /** First-run import: builds the vault around a bare key, no phrase involved. */
  createWalletFromPrivateKey: (
    privateKey: string,
    password: string
  ) => Promise<WalletAccount>
  /** Adds a key to an existing, unlocked wallet. */
  importPrivateKey: (privateKey: string, name?: string) => Promise<WalletAccount>
  unlock: (password: string) => Promise<boolean>
  lock: () => Promise<void>
  /**
   * Both exports re-derive the key from the password rather than reusing the
   * session key, so revealing a secret always costs a password entry and never
   * touches the lock state.
   */
  exportMnemonic: (password: string) => Promise<string>
  exportPrivateKey: (address: string, password: string) => Promise<string>
  /** Drops the vault itself, not just the session key: back to first run. */
  resetWallet: () => Promise<void>
  refreshLockState: () => Promise<void>
  clearPendingBackup: () => void

  createAccount: (name?: string) => Promise<WalletAccount>
  switchAccount: (address: string) => void
  updateAccountName: (address: string, name: string) => void

  addNetwork: (network: Network) => void
  switchNetwork: (networkId: string) => void

  connect: (origin: string) => void
  disconnect: (origin: string) => void

  signMessageFor: (address: string, message: string) => Promise<string>
}

const initialData: WalletData = {
  vault: null,
  accounts: [],
  currentAddress: null,
  networks: DEFAULT_NETWORKS,
  currentNetworkId: DEFAULT_NETWORKS[0].id,
  connections: []
}

const chromeStorage: PersistStorage<WalletData> = {
  getItem: async (name) => {
    const stored = await chrome.storage.local.get(name)
    return (stored[name] as StorageValue<WalletData> | undefined) ?? null
  },
  setItem: async (name, value) => {
    await chrome.storage.local.set({ [name]: value })
  },
  removeItem: async (name) => {
    await chrome.storage.local.remove(name)
  }
}

const toPublicAccount = ({ address, name, index }: StoredAccount): WalletAccount => ({
  address,
  name,
  index
})

const nextDerivationIndex = (accounts: StoredAccount[]): number =>
  accounts.reduce((highest, account) => Math.max(highest, account.index), -1) + 1

const requireSessionKey = async (): Promise<string> => {
  const key = await readSessionKey()
  if (!key) throw new Error("Wallet is locked")
  return key
}

/**
 * zustand v5 subscribes through `useSyncExternalStore`, which compares snapshots
 * with `Object.is` and has no equality hook. A selector that maps over state
 * therefore has to hand back the same array every time it runs, or React keeps
 * re-rendering until it throws and blanks the popup. Caching per `accounts`
 * array is enough: every store update replaces that array.
 */
const publicAccountsCache = new WeakMap<StoredAccount[], WalletAccount[]>()

export const selectPublicAccounts = (state: WalletData): WalletAccount[] => {
  const cached = publicAccountsCache.get(state.accounts)
  if (cached) return cached

  const accounts = state.accounts.map(toPublicAccount)
  publicAccountsCache.set(state.accounts, accounts)
  return accounts
}

export const selectCurrentAccount = (state: WalletData): WalletAccount | null =>
  selectPublicAccounts(state).find(
    ({ address }) => address === state.currentAddress
  ) ?? null

export const selectCurrentNetwork = (state: WalletData): Network =>
  state.networks.find(({ id }) => id === state.currentNetworkId) ?? state.networks[0]

export const isOriginConnected = (state: WalletData, origin: string): boolean =>
  state.connections.includes(origin)

export const useWalletStore = create<WalletStore>()(
  persist<WalletStore, [], [], WalletData>(
    (set, get) => ({
      ...initialData,
      isUnlocked: false,
      pendingBackup: null,

      createWallet: async (password) => {
        if (get().vault) throw new Error("A wallet already exists")

        const mnemonic = createMnemonic()
        const { meta, key } = await createVaultMeta(password)
        const derived = deriveAccount(mnemonic, 0)
        const account: StoredAccount = {
          address: derived.address,
          name: "Account 1",
          index: 0,
          encryptedPrivateKey: await encrypt(derived.privateKey, key)
        }

        await writeSessionKey(key)
        set({
          vault: { meta, encryptedMnemonic: await encrypt(mnemonic, key) },
          accounts: [account],
          currentAddress: account.address,
          isUnlocked: true,
          pendingBackup: mnemonic
        })

        return { mnemonic, account: toPublicAccount(account) }
      },

      importMnemonic: async (phrase, password) => {
        if (get().vault) throw new Error("A wallet already exists")

        const derived = deriveAccount(phrase, 0)
        const { meta, key } = await createVaultMeta(password)
        const account: StoredAccount = {
          address: derived.address,
          name: "Account 1",
          index: 0,
          encryptedPrivateKey: await encrypt(derived.privateKey, key)
        }

        await writeSessionKey(key)
        set({
          vault: { meta, encryptedMnemonic: await encrypt(phrase.trim(), key) },
          accounts: [account],
          currentAddress: account.address,
          isUnlocked: true
        })

        return toPublicAccount(account)
      },

      // A wallet built this way has no recovery phrase, so `encryptedMnemonic`
      // stays null and `createAccount` refuses to derive further accounts.
      createWalletFromPrivateKey: async (privateKey, password) => {
        if (get().vault) throw new Error("A wallet already exists")

        const derived = accountFromPrivateKey(privateKey)
        const { meta, key } = await createVaultMeta(password)
        const account: StoredAccount = {
          address: derived.address,
          name: "Imported Account",
          index: -1,
          encryptedPrivateKey: await encrypt(derived.privateKey, key)
        }

        await writeSessionKey(key)
        set({
          vault: { meta, encryptedMnemonic: null },
          accounts: [account],
          currentAddress: account.address,
          isUnlocked: true
        })

        return toPublicAccount(account)
      },

      // Imported keys have no place on the recovery-phrase tree, so index -1
      // keeps them out of `nextDerivationIndex`.
      importPrivateKey: async (privateKey, name = "Imported Account") => {
        const key = await requireSessionKey()
        const derived = accountFromPrivateKey(privateKey)

        if (get().accounts.some(({ address }) => address === derived.address)) {
          throw new Error("This account was already imported")
        }

        const account: StoredAccount = {
          address: derived.address,
          name,
          index: -1,
          encryptedPrivateKey: await encrypt(derived.privateKey, key)
        }

        set((state) => ({
          accounts: [...state.accounts, account],
          currentAddress: account.address
        }))

        return toPublicAccount(account)
      },

      unlock: async (password) => {
        const { vault } = get()
        if (!vault) return false

        const key = await unlockKey(password, vault.meta)
        if (!key) return false

        await writeSessionKey(key)
        set({ isUnlocked: true })
        return true
      },

      lock: async () => {
        await clearSessionKey()
        set({ isUnlocked: false })
      },

      // Deliberately goes through `unlockKey` instead of the session key: the
      // secret is handed straight back to the caller and never stored in state.
      exportMnemonic: async (password) => {
        const { vault } = get()
        if (!vault) throw new Error("No wallet to export")
        if (!vault.encryptedMnemonic) {
          throw new Error("This wallet has no recovery phrase")
        }

        const key = await unlockKey(password, vault.meta)
        if (!key) throw new Error("Wrong password")

        return decrypt(vault.encryptedMnemonic, key)
      },

      exportPrivateKey: async (address, password) => {
        const { vault, accounts } = get()
        if (!vault) throw new Error("No wallet to export")

        const account = accounts.find((entry) => entry.address === address)
        if (!account) throw new Error("Unknown account")

        const key = await unlockKey(password, vault.meta)
        if (!key) throw new Error("Wrong password")

        return decrypt(account.encryptedPrivateKey, key)
      },

      // Every secret lives in either the vault or the session key, so dropping
      // both is enough: the persisted blob is overwritten with the defaults on
      // the next write, and nothing recoverable is left behind.
      resetWallet: async () => {
        await clearSessionKey()
        set({ ...initialData, isUnlocked: false, pendingBackup: null })
      },

      refreshLockState: async () => {
        set({ isUnlocked: (await readSessionKey()) !== null })
      },

      clearPendingBackup: () => {
        set({ pendingBackup: null })
      },

      createAccount: async (name) => {
        const key = await requireSessionKey()
        const { vault, accounts } = get()
        if (!vault?.encryptedMnemonic) {
          throw new Error("This wallet has no recovery phrase")
        }

        const mnemonic = await decrypt(vault.encryptedMnemonic, key)
        const index = nextDerivationIndex(accounts)
        const derived = deriveAccount(mnemonic, index)
        const account: StoredAccount = {
          address: derived.address,
          name: name || `Account ${index + 1}`,
          index,
          encryptedPrivateKey: await encrypt(derived.privateKey, key)
        }

        set((state) => ({
          accounts: [...state.accounts, account],
          currentAddress: account.address
        }))

        return toPublicAccount(account)
      },

      switchAccount: (address) => {
        if (!get().accounts.some((account) => account.address === address)) return
        set({ currentAddress: address })
      },

      updateAccountName: (address, name) => {
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.address === address ? { ...account, name } : account
          )
        }))
      },

      addNetwork: (network) => {
        set((state) =>
          state.networks.some(({ id }) => id === network.id)
            ? state
            : { networks: [...state.networks, network] }
        )
      },

      switchNetwork: (networkId) => {
        if (!get().networks.some(({ id }) => id === networkId)) return
        set({ currentNetworkId: networkId })
      },

      connect: (origin) => {
        if (!origin) return
        set((state) =>
          state.connections.includes(origin)
            ? state
            : { connections: [...state.connections, origin] }
        )
      },

      disconnect: (origin) => {
        set((state) => ({
          connections: state.connections.filter((entry) => entry !== origin)
        }))
      },

      signMessageFor: async (address, message) => {
        const key = await requireSessionKey()
        const account = get().accounts.find((entry) => entry.address === address)
        if (!account) throw new Error("Unknown account")

        // The plaintext key exists only inside this call.
        const privateKey = await decrypt(account.encryptedPrivateKey, key)
        return signMessage(privateKey, message)
      }
    }),
    {
      name: WALLET_STORAGE_KEY,
      storage: chromeStorage,
      partialize: ({
        vault,
        accounts,
        currentAddress,
        networks,
        currentNetworkId,
        connections
      }) => ({
        vault,
        accounts,
        currentAddress,
        networks,
        currentNetworkId,
        connections
      }),
      // The lock flag lives in session storage, not in the persisted blob, so
      // it has to be recomputed every time the store rehydrates.
      onRehydrateStorage: () => (state) => {
        void state?.refreshLockState()
      }
    }
  )
)

/**
 * The service worker is restarted on demand and its in-memory copy of the store
 * goes stale whenever the popup writes, so every request re-reads storage.
 */
export const hydrateWalletStore = async (): Promise<WalletStore> => {
  await useWalletStore.persist.rehydrate()
  return useWalletStore.getState()
}


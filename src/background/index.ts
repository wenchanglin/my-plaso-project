import { readSessionKey } from "../lib/session.ts"
import {
  hydrateWalletStore,
  isOriginConnected,
  selectCurrentAccount
} from "../stores/walletStore.ts"
import {
  chromeAuthorizationGateway,
  createAuthorizationRequester
} from "./authorization.ts"
import { createRuntimeMessageListener } from "./listener.ts"
import { createWalletMessageHandler, type WalletGateway } from "./router.ts"

/**
 * Every call rehydrates first: the service worker is evicted between requests
 * and its in-memory store would otherwise miss whatever the popup changed.
 * `isUnlocked` reads session storage directly because that, not a persisted
 * flag, is the real source of truth for the lock state.
 */
const walletGateway: WalletGateway = {
  getCurrentAccount: async () => selectCurrentAccount(await hydrateWalletStore()),
  isUnlocked: async () => (await readSessionKey()) !== null,
  isConnected: async (origin) => isOriginConnected(await hydrateWalletStore(), origin),
  connect: async (origin) => {
    ;(await hydrateWalletStore()).connect(origin)
  },
  disconnect: async (origin) => {
    ;(await hydrateWalletStore()).disconnect(origin)
  },
  signMessage: async (address, message) =>
    (await hydrateWalletStore()).signMessageFor(address, message)
}

const handleWalletMessage = createWalletMessageHandler({
  requestAuthorization: createAuthorizationRequester(chromeAuthorizationGateway),
  wallet: walletGateway
})

chrome.runtime.onMessage.addListener(
  createRuntimeMessageListener(handleWalletMessage)
)

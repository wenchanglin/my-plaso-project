import { readSessionKey } from "../lib/session.ts"
import {
  hydrateWalletStore,
  isOriginConnected,
  selectCurrentAccount,
  selectCurrentNetwork
} from "../stores/walletStore.ts"
import type { Network } from "../types/wallet.ts"
import {
  chromeAuthorizationGateway,
  createAuthorizationRequester
} from "./authorization.ts"
import {
  createEthereumPortBroadcaster,
  createRuntimeMessageListener
} from "./listener.ts"
import { createWalletMessageHandler, type WalletGateway } from "./router.ts"
import { createEthereumRequestHandler, type EthereumWalletGateway } from "./ethereum-router.ts"

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

const ethereumWalletGateway: EthereumWalletGateway = {
  getCurrentAccount: walletGateway.getCurrentAccount,
  isUnlocked: walletGateway.isUnlocked,
  isConnected: walletGateway.isConnected,
  connect: walletGateway.connect,
  disconnect: walletGateway.disconnect,
  getCurrentNetwork: async () => selectCurrentNetwork(await hydrateWalletStore()),
  findNetworkByChainId: async (chainId) => {
    const store = await hydrateWalletStore()
    return store.networks.find((network) => network.chainId === chainId) ?? null
  },
  addNetwork: async (network: Network) => {
    ;(await hydrateWalletStore()).addNetwork(network)
  },
  switchNetwork: async (networkId) => {
    ;(await hydrateWalletStore()).switchNetwork(networkId)
  },
  signMessage: async (address, message) => {
    return (await hydrateWalletStore()).signMessageFor(address, message)
  },
  signTypedData: async (address, domain, types, value) =>
    (await hydrateWalletStore()).signTypedDataFor(address, domain, types, value),
  sendTransaction: async (address, transaction, network) =>
    (await hydrateWalletStore()).sendTransactionFor(address, transaction, network)
}

const rpcRequest = async (network: Network, method: string, params: unknown[]): Promise<unknown> => {
  const response = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  })
  if (!response.ok) throw Object.assign(new Error(`RPC request failed with HTTP ${response.status}`), { code: 4900 })
  const payload = (await response.json()) as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } }
  if (payload.error) {
    throw Object.assign(new Error(payload.error.message ?? "RPC request failed"), {
      code: payload.error.code ?? -32000,
      data: payload.error.data
    })
  }
  return payload.result
}

const handleWalletMessage = createWalletMessageHandler({
  requestAuthorization: createAuthorizationRequester(chromeAuthorizationGateway),
  wallet: walletGateway
})

const eventBroadcaster = createEthereumPortBroadcaster()

interface PublicWalletSnapshot {
  account: string | null
  chainId: number | null
  connections: string[]
}

let previousPublicState: PublicWalletSnapshot | null = null

const syncPublicWalletEvents = async (): Promise<void> => {
  const store = await hydrateWalletStore()
  const account = selectCurrentAccount(store)
  const network = selectCurrentNetwork(store)
  const next: PublicWalletSnapshot = {
    account: store.isUnlocked ? account?.address ?? null : null,
    chainId: network?.chainId ?? null,
    connections: [...store.connections]
  }

  if (previousPublicState) {
    const allOrigins = new Set([
      ...previousPublicState.connections,
      ...next.connections
    ])
    for (const origin of allOrigins) {
      if (previousPublicState.account !== next.account && next.connections.includes(origin)) {
        eventBroadcaster.broadcast(
          origin,
          "accountsChanged",
          next.account ? [next.account] : []
        )
      }
      if (previousPublicState.chainId !== next.chainId && next.chainId !== null && next.connections.includes(origin)) {
        eventBroadcaster.broadcast(origin, "chainChanged", `0x${next.chainId.toString(16)}`)
      }
      if (previousPublicState.connections.includes(origin) && !next.connections.includes(origin)) {
        eventBroadcaster.broadcast(origin, "accountsChanged", [])
        eventBroadcaster.broadcast(origin, "disconnect", { code: 4900, message: "Disconnected" })
      }
    }
  }

  previousPublicState = next
}

void syncPublicWalletEvents()
chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local" || areaName === "session") void syncPublicWalletEvents()
})

const handleEthereumMessage = createEthereumRequestHandler({
  wallet: ethereumWalletGateway,
  requestAuthorization: createAuthorizationRequester(chromeAuthorizationGateway),
  rpcRequest,
  onEvent: (origin, event, data) => eventBroadcaster.broadcast(origin, event, data)
})

chrome.runtime.onConnect.addListener(eventBroadcaster.addPort)

const handleMessage = async (message: unknown, context: { origin: string }) => {
  if (message && typeof message === "object" && (message as { type?: string }).type === "ETHEREUM_REQUEST") {
    try {
      return { success: true, data: await handleEthereumMessage(message, context) }
    } catch (cause) {
      const error = cause as { code?: number; message?: string; data?: unknown }
      return {
        success: false,
        error: {
          code: typeof error.code === "number" ? error.code : 4900,
          message: error.message ?? "Wallet request failed",
          ...(error.data === undefined ? {} : { data: error.data })
        }
      }
    }
  }
  return handleWalletMessage(message, context)
}

chrome.runtime.onMessage.addListener(
  createRuntimeMessageListener(handleMessage)
)

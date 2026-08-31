import {
  createRequestId,
  type EthereumRequestData,
  type WalletResponse
} from "../bridge/protocol.ts"

export interface ProviderRpcError extends Error {
  code: number
  data?: unknown
}

export interface EthereumProvider {
  isMetaMask: boolean
  isMyWallet: boolean
  selectedAddress: string | null
  chainId: string | null
  networkVersion: string | null
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>
  send: (...args: unknown[]) => unknown
  sendAsync: (
    request: { jsonrpc?: string; id?: number | string; method: string; params?: unknown[] },
    callback: (error: ProviderRpcError | null, response?: unknown) => void
  ) => void
  on: (event: string, listener: (...args: unknown[]) => void) => EthereumProvider
  once: (event: string, listener: (...args: unknown[]) => void) => EthereumProvider
  off: (event: string, listener: (...args: unknown[]) => void) => EthereumProvider
  removeListener: (event: string, listener: (...args: unknown[]) => void) => EthereumProvider
  _metamask: { isUnlocked: () => Promise<boolean> }
}

interface MessageTarget {
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  removeEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  postMessage: (message: unknown, targetOrigin?: string) => void
  dispatchEvent?: (event: Event) => boolean
}

interface ProviderOptions {
  timeoutMs?: number
  interactiveTimeoutMs?: number
  uuid?: string
  icon?: string
}

/** Reads are answered in milliseconds, so this only ever catches a dead bridge. */
export const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Ceiling for the methods that can open the approval popup, where the wait is a
 * human's, not a machine's.
 *
 * It has to stay *above* the background's DEFAULT_AUTHORIZATION_TIMEOUT_MS
 * (300s). Below it — as 30s was — the page rejects while the background is
 * still waiting, and the confirmation that lands afterwards broadcasts a
 * transaction the dapp has already reported as failed. So the background always
 * answers first and this timer is only a safety net for a broken bridge.
 */
export const INTERACTIVE_TIMEOUT_MS = 330_000

/** Every method in `background/ethereum-router.ts` that can ask the user. */
export const INTERACTIVE_METHODS = new Set([
  "eth_requestAccounts",
  "wallet_requestPermissions",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain"
])

const PROVIDER_INFO = {
  name: "My Wallet",
  rdns: "com.mywallet",
  icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23111827'/%3E%3Cpath d='M14 20h36v8H14zm0 12h24v8H14zm0 12h36v8H14z' fill='%23fff'/%3E%3C/svg%3E"
}

const providerError = (
  code: number,
  message: string,
  data?: unknown
): ProviderRpcError => {
  const error = Object.assign(new Error(message), { code }) as ProviderRpcError
  if (data !== undefined) error.data = data
  return error
}

const toError = (error: unknown): ProviderRpcError => {
  if (error && typeof error === "object" && "code" in error) {
    const source = error as { code: unknown; message?: unknown; data?: unknown }
    if (typeof source.code === "number") {
      return providerError(
        source.code,
        typeof source.message === "string" ? source.message : "Wallet request failed",
        source.data
      )
    }
  }
  return providerError(4900, error instanceof Error ? error.message : "Wallet request failed")
}

const dispatch = (target: MessageTarget, type: string, detail: unknown): void => {
  if (typeof target.dispatchEvent !== "function") return
  target.dispatchEvent(new CustomEvent(type, { detail }))
}

export const createDappProvider = (
  target: MessageTarget,
  options: ProviderOptions = {}
): EthereumProvider => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const interactiveTimeoutMs = options.interactiveTimeoutMs ?? INTERACTIVE_TIMEOUT_MS
  const timeoutFor = (method: string) =>
    INTERACTIVE_METHODS.has(method) ? interactiveTimeoutMs : timeoutMs
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const onceWrappers = new Map<
    string,
    Map<(...args: unknown[]) => void, (...args: unknown[]) => void>
  >()
  const pending = new Map<string, (response: WalletResponse) => void>()
  let providerConnected = false
  let connectEventEmitted = false
  let connectedAccounts: string[] = []
  const sameAccounts = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((account, index) => account === right[index])
  const provider: EthereumProvider = {
    isMetaMask: true,
    isMyWallet: true,
    selectedAddress: null,
    chainId: null,
    networkVersion: null,
    request: async (input) => {
      const request = input as { method?: unknown; params?: unknown[] } | null | undefined
      const method = request && typeof request === "object" ? request.method : undefined
      if (typeof method !== "string" || method.length === 0) {
        throw providerError(-32600, "Invalid request")
      }
      if (request?.params !== undefined && !Array.isArray(request.params)) {
        throw providerError(-32602, "Invalid request params")
      }
      const params = request?.params ?? []

      const requestId = createRequestId()
      const data: EthereumRequestData = { method, params }
      const response = await new Promise<WalletResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId)
          reject(providerError(4900, "Wallet request timed out"))
        }, timeoutFor(method))

        pending.set(requestId, (result) => {
          clearTimeout(timer)
          pending.delete(requestId)
          resolve(result)
        })
        target.postMessage(
          {
            from: "my-wallet-injected",
            type: "ETHEREUM_REQUEST",
            requestId,
            data
          },
          "*"
        )
      })

      if (!response.success) throw toError(response.error)

      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        const accounts = Array.isArray(response.data) ? response.data : []
        const nextAddress = typeof accounts[0] === "string" ? accounts[0] : null
        const changed = provider.selectedAddress !== nextAddress
        provider.selectedAddress = nextAddress
        const wasConnected = providerConnected
        const accountsChanged = !sameAccounts(connectedAccounts, accounts as string[])
        connectedAccounts = accounts as string[]
        providerConnected = accounts.length > 0
        if (changed || accountsChanged) emit("accountsChanged", accounts)
        if (method === "eth_requestAccounts" && !wasConnected && providerConnected && !connectEventEmitted) {
          emit("connect", { chainId: provider.chainId })
          connectEventEmitted = true
        }
      } else if (method === "eth_chainId" && typeof response.data === "string") {
        provider.chainId = response.data
        const numeric = Number.parseInt(response.data, 16)
        provider.networkVersion = Number.isNaN(numeric) ? null : String(numeric)
      }

      return response.data
    },
    send: (...args: unknown[]) => {
      const first = args[0]
      if (typeof first === "string") {
        const params = Array.isArray(args[1]) ? (args[1] as unknown[]) : []
        const request = provider.request({ method: first, params })
        const callback = args[2]
        if (typeof callback === "function") {
          void request.then(
            (result) => (callback as (error: null, response: unknown) => void)(null, {
              jsonrpc: "2.0",
              result
            }),
            (error) => (callback as (error: ProviderRpcError, response?: unknown) => void)(toError(error))
          )
          return undefined
        }
        return request
      }

      const payload = first as { id?: number | string; method?: string; params?: unknown[] }
      const callback = args[1]
      const request = provider.request({ method: payload?.method ?? "", params: payload?.params ?? [] })
      if (typeof callback === "function") {
        void request.then(
          (result) => (callback as (error: null, response: unknown) => void)(null, {
            jsonrpc: "2.0",
            id: payload?.id,
            result
          }),
          (error) => (callback as (error: ProviderRpcError, response?: unknown) => void)(toError(error))
        )
        return undefined
      }
      return request
    },
    sendAsync: (payload, callback) => {
      void provider.request({ method: payload.method, params: payload.params ?? [] }).then(
        (result) => callback(null, { jsonrpc: "2.0", id: payload.id, result }),
        (error) => callback(toError(error))
      )
    },
    on: (event, listener) => {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(listener)
      return provider
    },
    once: (event, listener) => {
      let eventWrappers = onceWrappers.get(event)
      if (!eventWrappers) {
        eventWrappers = new Map()
        onceWrappers.set(event, eventWrappers)
      }
      const wrapper = (...args: unknown[]) => {
        provider.off(event, wrapper)
        eventWrappers?.delete(listener)
        if (eventWrappers?.size === 0) onceWrappers.delete(event)
        listener(...args)
      }
      eventWrappers.set(listener, wrapper)
      provider.on(event, wrapper)
      return provider
    },
    off: (event, listener) => {
      const set = listeners.get(event)
      if (set) {
        set.delete(listener)
        const eventWrappers = onceWrappers.get(event)
        const wrapper = eventWrappers?.get(listener)
        if (wrapper) {
          set.delete(wrapper)
          eventWrappers?.delete(listener)
        }
        if (eventWrappers?.size === 0) onceWrappers.delete(event)
      }
      return provider
    },
    removeListener: undefined as never,
    _metamask: { isUnlocked: () => provider.request({ method: "wallet_isUnlocked" }) as Promise<boolean> }
  }
  provider.removeListener = provider.off

  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) {
      try {
        listener(...args)
      } catch (error) {
        queueMicrotask(() => { throw error })
      }
    }
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== target || !event.data || typeof event.data !== "object") return
    const message = event.data as {
      from?: string
      requestId?: string
      success?: boolean
      error?: WalletResponse["error"]
      type?: string
      event?: string
      data?: unknown
    }
    if (message.from === "my-wallet-bridge" && typeof message.requestId === "string") {
      pending.get(message.requestId)?.(message as WalletResponse)
      return
    }
    if (message.from !== "my-wallet-background" || message.type !== "ETHEREUM_EVENT") return
    if (typeof message.event !== "string") return
    if (message.event === "accountsChanged") {
      const accounts = Array.isArray(message.data) ? message.data : []
      const changed = !sameAccounts(connectedAccounts, accounts as string[])
      connectedAccounts = accounts as string[]
      provider.selectedAddress = typeof accounts[0] === "string" ? accounts[0] : null
      providerConnected = accounts.length > 0
      if (changed) emit(message.event, accounts)
    } else if (message.event === "chainChanged" && typeof message.data === "string") {
      const changed = provider.chainId !== message.data
      provider.chainId = message.data
      provider.networkVersion = String(Number.parseInt(message.data, 16))
      if (changed) emit(message.event, message.data)
    } else {
      if (message.event === "connect") {
        const chainId = message.data && typeof message.data === "object"
          ? (message.data as { chainId?: unknown }).chainId
          : undefined
        if (typeof chainId === "string") {
          provider.chainId = chainId
          const numeric = Number.parseInt(chainId, 16)
          provider.networkVersion = Number.isNaN(numeric) ? null : String(numeric)
        }
        providerConnected = true
        if (connectEventEmitted) return
        connectEventEmitted = true
      }
      if (message.event === "disconnect") {
        if (!providerConnected && !connectEventEmitted) return
        providerConnected = false
        connectEventEmitted = false
        connectedAccounts = []
        provider.selectedAddress = null
      }
      emit(message.event, message.data)
    }
  }
  target.addEventListener("message", handleMessage)

  const announce = () => {
    dispatch(target, "eip6963:announceProvider", {
      info: {
        uuid: options.uuid ?? "9d8f55d4-8e13-4e0f-9f5c-2c6d1f5e9b21",
        name: PROVIDER_INFO.name,
        icon: options.icon ?? PROVIDER_INFO.icon,
        rdns: PROVIDER_INFO.rdns
      },
      provider
    })
  }
  target.addEventListener("eip6963:requestProvider", announce)
  queueMicrotask(announce)

  return provider
}

export { providerError }

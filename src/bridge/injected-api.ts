import {
  createRequestId,
  type WalletMessageType,
  type WalletResponse
} from "./protocol.ts"

export interface InjectedWalletApi {
  connect: () => Promise<unknown>
  getAccount: () => Promise<unknown>
  signMessage: (message: string) => Promise<unknown>
  disconnect: () => Promise<unknown>
}

interface MessageTarget {
  addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void
  removeEventListener: (type: "message", listener: (event: MessageEvent) => void) => void
  postMessage: (message: unknown, targetOrigin?: string) => void
}

interface InjectedWalletOptions {
  timeoutMs?: number
  interactiveTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * `connect` and `signMessage` wait for the user, so they need the same ceiling
 * as the EIP-1193 path in `services/dappProvider.ts`: above the background's
 * DEFAULT_AUTHORIZATION_TIMEOUT_MS, or an approval that arrives after the page
 * gave up still takes effect while the caller has been told it failed.
 */
export const INTERACTIVE_TIMEOUT_MS = 330_000

export const INTERACTIVE_TYPES = new Set<WalletMessageType>([
  "WALLET_CONNECT",
  "WALLET_SIGN_MESSAGE"
])

/**
 * Creates the page-facing API without importing any Chrome APIs. The MAIN
 * world can see page JavaScript but cannot call chrome.runtime, so every
 * operation crosses the isolated-world bridge through window.postMessage.
 */
export const createInjectedWallet = (
  target: MessageTarget,
  options: InjectedWalletOptions = {}
): InjectedWalletApi => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const interactiveTimeoutMs = options.interactiveTimeoutMs ?? INTERACTIVE_TIMEOUT_MS

  const request = (type: WalletMessageType, data?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const requestId = createRequestId()

      // Each call owns exactly one listener and one timer. All terminal paths
      // use cleanup so repeated dapp calls cannot accumulate stale handlers.
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        target.removeEventListener("message", handleResponse)
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }

      const handleResponse = (event: MessageEvent) => {
        if (event.source !== target) return

        const response = event.data as Partial<WalletResponse> | undefined
        if (
          !response ||
          response.from !== "my-wallet-bridge" ||
          response.requestId !== requestId ||
          typeof response.success !== "boolean"
        ) {
          return
        }

        cleanup()
        if (response.success) {
          resolve(response.data)
        } else {
          const error = response.error
          reject(
            typeof error === "string"
              ? new Error(error)
              : Object.assign(new Error(error?.message || "Wallet request failed"), error)
          )
        }
      }

      target.addEventListener("message", handleResponse)
      target.postMessage(
        {
          from: "my-wallet-injected",
          type,
          requestId,
          ...(data === undefined ? {} : { data })
        },
        "*"
      )

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error("Wallet request timed out"))
      }, INTERACTIVE_TYPES.has(type) ? interactiveTimeoutMs : timeoutMs)
    })

  return {
    connect: () => request("WALLET_CONNECT"),
    getAccount: () => request("WALLET_GET_ACCOUNT"),
    signMessage: (message: string) => request("WALLET_SIGN_MESSAGE", { message }),
    disconnect: () => request("WALLET_DISCONNECT")
  }
}

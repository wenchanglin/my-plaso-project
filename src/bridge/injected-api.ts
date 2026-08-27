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
}

const DEFAULT_TIMEOUT_MS = 30_000

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
          reject(new Error(response.error || "Wallet request failed"))
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
      }, timeoutMs)
    })

  return {
    connect: () => request("WALLET_CONNECT"),
    getAccount: () => request("WALLET_GET_ACCOUNT"),
    signMessage: (message: string) => request("WALLET_SIGN_MESSAGE", { message }),
    disconnect: () => request("WALLET_DISCONNECT")
  }
}

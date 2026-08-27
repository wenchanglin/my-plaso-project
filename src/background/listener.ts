import { isWalletRequest } from "../bridge/protocol.ts"
import type { WalletRequestContext } from "./router.ts"

export type WalletRuntimeHandler = (
  message: unknown,
  context: WalletRequestContext
) => Promise<unknown>

/**
 * Chrome reports the sender, so the origin comes from the browser rather than
 * from the page. A dapp therefore cannot claim to be a site the user already
 * approved.
 */
export const readSenderOrigin = (sender: unknown): string => {
  const { origin, url } = (sender ?? {}) as { origin?: string; url?: string }
  if (origin) return origin
  if (!url) return ""

  try {
    return new URL(url).origin
  } catch {
    return ""
  }
}

/**
 * Chrome dispatches all runtime messages through one event. Returning false
 * for non-wallet messages lets Plasmo's generated messaging listener handle
 * names such as `getData` without competing for sendResponse.
 */
export const createRuntimeMessageListener = (handler: WalletRuntimeHandler) =>
  (message: unknown, sender: unknown, sendResponse: (response: unknown) => void): boolean => {
    if (!isWalletRequest(message)) return false

    void handler(message, { origin: readSenderOrigin(sender) })
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Wallet request failed"
        })
      )
    return true
  }

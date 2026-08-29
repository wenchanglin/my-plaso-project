import { isWalletRequest, type WalletRequest, type WalletResponse } from "./protocol.ts"

export type RuntimeSendMessage = (
  message: WalletRequest,
  callback: (response?: Pick<WalletResponse, "success" | "data" | "error">) => void
) => void

export type BridgeEvent = {
  source: unknown
  data: unknown
}

export type BridgePostMessage = (message: WalletResponse, targetOrigin?: string) => void

const getRuntimeError = (): string | undefined => {
  const chromeApi = (globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } }).chrome
  return chromeApi?.runtime?.lastError?.message
}

/**
 * The MAIN world cannot access chrome.runtime, while an isolated content
 * script cannot safely expose page globals. This narrow bridge is the boundary
 * between them: validate first, forward only the typed request, and serialize
 * every response back to the page.
 */
export const handleWalletMessage = async (
  event: BridgeEvent,
  runtimeSendMessage: RuntimeSendMessage,
  postMessage: BridgePostMessage,
  windowSource: unknown
): Promise<void> => {
  // Checking object identity prevents another frame or an unrelated page from
  // injecting a message into this page's request stream.
  if (event.source !== windowSource || !isWalletRequest(event.data)) return

  const request = event.data
  runtimeSendMessage(request, (response) => {
    const runtimeError = getRuntimeError()
    if (runtimeError) {
      postMessage({
        from: "my-wallet-bridge",
        requestId: request.requestId,
        success: false,
        error: runtimeError
      })
      return
    }

    if (response?.success === false) {
      postMessage({
        from: "my-wallet-bridge",
        requestId: request.requestId,
        success: false,
        error: response.error || "Wallet request failed"
      })
      return
    }

    postMessage({
      from: "my-wallet-bridge",
      requestId: request.requestId,
      success: true,
      data: response?.data
    })
  })
}

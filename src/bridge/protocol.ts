/**
 * Messages cross two boundaries in this extension: the page's MAIN world and
 * the isolated content script, then the content script and the background
 * service worker. Keeping the protocol in one module prevents string drift.
 */
export const WALLET_MESSAGE_TYPES = [
  "WALLET_CONNECT",
  "WALLET_GET_ACCOUNT",
  "WALLET_SIGN_MESSAGE",
  "WALLET_DISCONNECT"
] as const

export type WalletMessageType = (typeof WALLET_MESSAGE_TYPES)[number]

export interface WalletRequest {
  from: "my-wallet-injected"
  type: WalletMessageType
  requestId: string
  data?: unknown
}

export interface WalletResponse {
  from: "my-wallet-bridge"
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

export const isWalletMessageType = (
  value: unknown
): value is WalletMessageType =>
  typeof value === "string" &&
  (WALLET_MESSAGE_TYPES as readonly string[]).includes(value)

export const isWalletRequest = (value: unknown): value is WalletRequest => {
  if (!value || typeof value !== "object") return false

  const request = value as Partial<WalletRequest>
  return (
    request.from === "my-wallet-injected" &&
    isWalletMessageType(request.type) &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0
  )
}

export const createRequestId = (): string => {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `request-${Date.now().toString(36)}-${randomPart}`
}

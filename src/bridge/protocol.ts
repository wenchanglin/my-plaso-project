/**
 * Messages cross two boundaries in this extension: the page's MAIN world and
 * the isolated content script, then the content script and the background
 * service worker. Keeping the protocol in one module prevents string drift.
 */
export const WALLET_MESSAGE_TYPES = [
  "WALLET_CONNECT",
  "WALLET_GET_ACCOUNT",
  "WALLET_SIGN_MESSAGE",
  "WALLET_DISCONNECT",
  "ETHEREUM_REQUEST"
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
  error?: string | { code: number; message: string; data?: unknown }
}

export interface EthereumRequestData {
  method: string
  params: unknown[]
}

export interface EthereumRequest extends WalletRequest {
  type: "ETHEREUM_REQUEST"
  data: EthereumRequestData
}

export const isEthereumEvent = (value: unknown): value is {
  from: "my-wallet-background"
  type: "ETHEREUM_EVENT"
  event: "accountsChanged" | "chainChanged" | "connect" | "disconnect"
  data?: unknown
} => {
  if (!value || typeof value !== "object") return false
  const message = value as { from?: unknown; type?: unknown; event?: unknown }
  return message.from === "my-wallet-background" &&
    message.type === "ETHEREUM_EVENT" &&
    ["accountsChanged", "chainChanged", "connect", "disconnect"].includes(message.event as string)
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

export const isEthereumRequest = (value: unknown): value is EthereumRequest => {
  if (!isWalletRequest(value) || value.type !== "ETHEREUM_REQUEST") return false
  if (!value.data || typeof value.data !== "object") return false

  const data = value.data as Partial<EthereumRequestData>
  return typeof data.method === "string" && data.method.length > 0 &&
    Array.isArray(data.params)
}

export const createRequestId = (): string => {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `request-${Date.now().toString(36)}-${randomPart}`
}

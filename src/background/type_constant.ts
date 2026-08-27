import type { WalletMessageType } from "../bridge/protocol.ts"

/** Stable aliases kept for callers that migrated from the reference project. */
export const WALLET_CONNECT: WalletMessageType = "WALLET_CONNECT"
export const WALLET_GET_ACCOUNT: WalletMessageType = "WALLET_GET_ACCOUNT"
export const WALLET_SIGN_MESSAGE: WalletMessageType = "WALLET_SIGN_MESSAGE"
export const WALLET_DISCONNECT: WalletMessageType = "WALLET_DISCONNECT"

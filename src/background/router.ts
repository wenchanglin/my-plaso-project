import { isWalletRequest, type WalletRequest } from "../bridge/protocol.ts"
import type { AuthorizationDecision } from "../lib/authorization.ts"
import type { WalletAccount } from "../types/wallet.ts"

export interface WalletRequestContext {
  /** Page origin reported by Chrome, never by the page itself. */
  origin: string
}

/**
 * The wallet operations the router is allowed to perform. Everything is behind
 * this interface so routing stays testable and so the router cannot reach key
 * material: it can ask for a signature, but it never sees a private key.
 */
export interface WalletGateway {
  getCurrentAccount: () => Promise<WalletAccount | null>
  isUnlocked: () => Promise<boolean>
  isConnected: (origin: string) => Promise<boolean>
  connect: (origin: string) => Promise<void>
  disconnect: (origin: string) => Promise<void>
  signMessage: (address: string, message: string) => Promise<string>
}

export interface WalletMessageHandlerOptions {
  requestAuthorization: (
    request: WalletRequest,
    context: { origin: string; message?: string }
  ) => Promise<AuthorizationDecision>
  wallet: WalletGateway
}

export interface WalletMessageResponse {
  success: boolean
  data?: unknown
  error?: string
}

const readMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null
  const message = (data as { message?: unknown }).message
  return typeof message === "string" && message.length > 0 ? message : null
}

const failure = (error: string): WalletMessageResponse => ({ success: false, error })

/**
 * Keeps message routing independent from Chrome globals so the protocol can
 * be tested in Node and the service worker only has to adapt callbacks.
 */
export const createWalletMessageHandler = ({
  requestAuthorization,
  wallet
}: WalletMessageHandlerOptions) => {
  return async (
    value: unknown,
    context: WalletRequestContext
  ): Promise<WalletMessageResponse> => {
    if (!isWalletRequest(value)) {
      return failure("Invalid wallet message")
    }

    if (!context.origin) {
      return failure("Unknown request origin")
    }

    switch (value.type) {
      case "WALLET_CONNECT": {
        const account = await wallet.getCurrentAccount()
        if (!account) {
          return failure("No wallet yet. Create or import one in the extension.")
        }

        // An already approved origin does not prompt again, but a locked wallet
        // still has to go through the popup so the user can unlock it.
        if ((await wallet.isConnected(context.origin)) && (await wallet.isUnlocked())) {
          return { success: true, data: { account } }
        }

        const decision = await requestAuthorization(value, { origin: context.origin })
        if (!decision.approved) {
          return failure("User rejected authorization")
        }

        if (!(await wallet.isUnlocked())) {
          return failure("Wallet is locked")
        }

        await wallet.connect(context.origin)
        // The user may have switched accounts inside the popup.
        const approvedAccount = await wallet.getCurrentAccount()
        return { success: true, data: { account: approvedAccount ?? account } }
      }

      case "WALLET_GET_ACCOUNT": {
        if (!(await wallet.isConnected(context.origin))) {
          return failure("This site is not connected")
        }

        const account = await wallet.getCurrentAccount()
        return account
          ? { success: true, data: { account } }
          : failure("No wallet yet. Create or import one in the extension.")
      }

      case "WALLET_SIGN_MESSAGE": {
        const message = readMessage(value.data)
        if (!message) {
          return failure("Missing message to sign")
        }
        if (!(await wallet.isConnected(context.origin))) {
          return failure("This site is not connected")
        }

        const account = await wallet.getCurrentAccount()
        if (!account) {
          return failure("No wallet yet. Create or import one in the extension.")
        }

        // Every signature is a separate decision; connecting is not consent to sign.
        const decision = await requestAuthorization(value, {
          origin: context.origin,
          message
        })
        if (!decision.approved) {
          return failure("User rejected the signature request")
        }

        const signature = await wallet.signMessage(account.address, message)
        return { success: true, data: { signature, address: account.address } }
      }

      case "WALLET_DISCONNECT":
        await wallet.disconnect(context.origin)
        return { success: true, data: true }
    }
  }
}

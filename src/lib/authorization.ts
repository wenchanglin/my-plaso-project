/**
 * Shared plumbing for the dapp authorization handshake.
 *
 * The service worker cannot render UI, and the popup cannot be awaited, so the
 * two sides meet in `chrome.storage.session`: the worker writes the pending
 * request, the popup writes a decision under `decisionKey`, and the worker
 * resolves as soon as that key changes. Session storage is memory-only and
 * unreachable from content scripts, so a page cannot forge a decision.
 */
import type { WalletMessageType } from "../bridge/protocol.ts"

export interface PendingAuthorization {
  requestId: string
  decisionKey: string
  type: WalletMessageType
  origin: string
  /** Present for signature requests so the popup can show what is signed. */
  message?: string
}

export interface AuthorizationDecision {
  approved: boolean
}

const PENDING_KEY = "wallet-pending-authorization"

export const createDecisionKey = (requestId: string): string =>
  `wallet-decision-${requestId}`

export const readPendingAuthorization = async (): Promise<PendingAuthorization | null> => {
  const stored = await chrome.storage.session.get(PENDING_KEY)
  return (stored[PENDING_KEY] as PendingAuthorization | undefined) ?? null
}

export const writePendingAuthorization = (
  pending: PendingAuthorization
): Promise<void> => chrome.storage.session.set({ [PENDING_KEY]: pending })

export const clearPendingAuthorization = (): Promise<void> =>
  chrome.storage.session.remove(PENDING_KEY)

export const readDecision = async (
  decisionKey: string
): Promise<AuthorizationDecision | null> => {
  const stored = await chrome.storage.session.get(decisionKey)
  return (stored[decisionKey] as AuthorizationDecision | undefined) ?? null
}

export const writeDecision = (
  decisionKey: string,
  decision: AuthorizationDecision
): Promise<void> => chrome.storage.session.set({ [decisionKey]: decision })

export const clearDecision = (decisionKey: string): Promise<void> =>
  chrome.storage.session.remove(decisionKey)

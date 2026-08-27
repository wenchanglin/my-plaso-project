/**
 * Turns a dapp request into a user decision.
 *
 * The gateway is injected so the handshake can be tested without Chrome, and so
 * the popup-opening strategy stays in one place.
 */
import {
  clearDecision,
  clearPendingAuthorization,
  createDecisionKey,
  readDecision,
  writePendingAuthorization,
  type AuthorizationDecision,
  type PendingAuthorization
} from "../lib/authorization.ts"
import type { WalletRequest } from "../bridge/protocol.ts"

export const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 60_000

export interface AuthorizationGateway {
  writePending: (pending: PendingAuthorization) => Promise<void>
  clearPending: () => Promise<void>
  openPopup: () => Promise<void>
  waitForDecision: (
    decisionKey: string,
    timeoutMs: number
  ) => Promise<AuthorizationDecision | null>
}

export interface AuthorizationRequestContext {
  origin: string
  message?: string
}

const openPopup = async (): Promise<void> => {
  // chrome.action.openPopup landed in Chrome 127; older builds need a window.
  const action = chrome.action as typeof chrome.action & {
    openPopup?: () => Promise<void>
  }

  if (typeof action.openPopup === "function") {
    try {
      await action.openPopup()
      return
    } catch {
      // The call fails when no window is focused, so fall through.
    }
  }

  await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 400,
    height: 600
  })
}

const waitForDecision = (
  decisionKey: string,
  timeoutMs: number
): Promise<AuthorizationDecision | null> =>
  new Promise((resolve) => {
    let settled = false

    const finish = (decision: AuthorizationDecision | null) => {
      if (settled) return
      settled = true
      chrome.storage.onChanged.removeListener(listener)
      clearTimeout(timer)
      void clearDecision(decisionKey)
      resolve(decision)
    }

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "session") return
      const decision = changes[decisionKey]?.newValue as
        | AuthorizationDecision
        | undefined
      if (decision) finish(decision)
    }

    chrome.storage.onChanged.addListener(listener)
    // A closed popup never decides, so the request must not hang forever.
    const timer = setTimeout(() => finish(null), timeoutMs)

    // The popup may have answered before this listener was attached.
    void readDecision(decisionKey).then((decision) => {
      if (decision) finish(decision)
    })
  })

export const chromeAuthorizationGateway: AuthorizationGateway = {
  writePending: writePendingAuthorization,
  clearPending: clearPendingAuthorization,
  openPopup,
  waitForDecision
}

export const createAuthorizationRequester = (
  gateway: AuthorizationGateway,
  timeoutMs: number = DEFAULT_AUTHORIZATION_TIMEOUT_MS
) =>
  async (
    request: WalletRequest,
    context: AuthorizationRequestContext
  ): Promise<AuthorizationDecision> => {
    const decisionKey = createDecisionKey(request.requestId)

    await gateway.writePending({
      requestId: request.requestId,
      decisionKey,
      type: request.type,
      origin: context.origin,
      ...(context.message === undefined ? {} : { message: context.message })
    })

    try {
      await gateway.openPopup()
      const decision = await gateway.waitForDecision(decisionKey, timeoutMs)
      return { approved: decision?.approved === true }
    } finally {
      await gateway.clearPending()
    }
  }

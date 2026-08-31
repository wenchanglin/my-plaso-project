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

/**
 * How long a pending request waits for the user.
 *
 * This is a human's reading time, not a machine timeout: a swap confirmation
 * arrives as the third popup in a row (switch chain, approve, then the swap
 * itself) and the panel shows raw calldata, so a minute is not enough. The
 * page-side ceilings in `services/dappProvider.ts` and `bridge/injected-api.ts`
 * are deliberately set above this value — see the note there.
 */
export const DEFAULT_AUTHORIZATION_TIMEOUT_MS = 300_000

/**
 * MV3 evicts a service worker after 30 seconds of inactivity, and waiting for a
 * human is pure inactivity — so the timer below would often never fire and the
 * dapp would get no answer at all. Touching any extension API resets that idle
 * timer, which is the only supported way to hold the worker open.
 */
const KEEPALIVE_INTERVAL_MS = 20_000

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

const keepWorkerAlive = (): (() => void) => {
  const ping = () => {
    // Cheap, side-effect-free, and enough to reset the idle timer. A worker
    // already being torn down can throw or reject here; either way there is
    // nothing left to keep alive.
    try {
      void Promise.resolve(chrome.runtime.getPlatformInfo?.()).catch(() => {})
    } catch {
      // ignored
    }
  }

  const interval = setInterval(ping, KEEPALIVE_INTERVAL_MS)
  return () => clearInterval(interval)
}

const waitForDecision = (
  decisionKey: string,
  timeoutMs: number
): Promise<AuthorizationDecision | null> =>
  new Promise((resolve) => {
    let settled = false
    const stopKeepalive = keepWorkerAlive()

    const finish = (decision: AuthorizationDecision | null) => {
      if (settled) return
      settled = true
      chrome.storage.onChanged.removeListener(listener)
      clearTimeout(timer)
      stopKeepalive()
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

import { useCallback, useEffect, useState } from "react"

import {
  readPendingAuthorization,
  writeDecision,
  type PendingAuthorization
} from "../lib/authorization.ts"

export interface AuthorizationRequestState {
  pending: PendingAuthorization | null
  isLoading: boolean
  error: string | null
  decide: (approved: boolean) => Promise<void>
}

/**
 * Mirrors the pending request the service worker published. The popup can be
 * opened before, during, or after a request arrives, so it reads once on mount
 * and then follows `chrome.storage.session` changes.
 */
export const useAuthorizationRequest = (): AuthorizationRequestState => {
  const [pending, setPending] = useState<PendingAuthorization | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const next = await readPendingAuthorization()
        if (!active) return
        setPending(next)
        setError(null)
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : "读取授权请求失败")
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()

    const listener = (_changes: unknown, areaName: string) => {
      if (areaName === "session") void load()
    }
    chrome.storage.onChanged.addListener(listener)

    return () => {
      active = false
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [])

  const decide = useCallback(
    async (approved: boolean) => {
      if (!pending) return
      await writeDecision(pending.decisionKey, { approved })
      setPending(null)
      // The worker resolves the dapp promise; this window has nothing left to do.
      window.close()
    },
    [pending]
  )

  return { pending, isLoading, error, decide }
}

import React, { useEffect, useState } from "react"

import { AuthorizationPanel } from "../components/wallet/AuthorizationPanel.tsx"
import { BackupPhrase } from "../components/wallet/BackupPhrase.tsx"
import { ErrorText } from "../components/wallet/controls.tsx"
import { UnlockWallet } from "../components/wallet/UnlockWallet.tsx"
import { WalletDashboard } from "../components/wallet/WalletDashboard.tsx"
import { WalletSetup } from "../components/wallet/WalletSetup.tsx"
import { useAuthorizationRequest } from "../hooks/use-authorization-request.ts"
import { getPopupState } from "../popup-state.ts"
import { useWalletStore } from "../stores/walletStore.ts"

/**
 * `chrome.storage.local` is async, so the first render always sees the store's
 * initial state. Waiting for hydration avoids flashing the setup screen at a
 * user who already has a wallet.
 */
const useWalletHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState(() =>
    useWalletStore.persist.hasHydrated()
  )

  useEffect(
    () => useWalletStore.persist.onFinishHydration(() => setHydrated(true)),
    []
  )

  return hydrated
}

export function PageIndex() {
  const hydrated = useWalletHydrated()
  const { pending, isLoading, error, decide } = useAuthorizationRequest()
  const hasWallet = useWalletStore((state) => state.vault !== null)
  const isUnlocked = useWalletStore((state) => state.isUnlocked)
  const pendingBackup = useWalletStore((state) => state.pendingBackup)

  const state = getPopupState({ isLoading: isLoading || !hydrated, pending, error })

  const body = () => {
    if (state.kind === "loading") {
      return (
        <p className="plasmo-text-sm plasmo-text-neutral-500">{state.title}</p>
      )
    }

    if (!hasWallet) return <WalletSetup />

    // Unlocking comes first: a locked wallet cannot sign, so approving a
    // request here would hand the dapp a promise the worker has to reject.
    if (!isUnlocked) return <UnlockWallet />

    // A phrase that has not been acknowledged blocks everything else: it is
    // unreadable again once this popup closes.
    if (pendingBackup) return <BackupPhrase phrase={pendingBackup} />

    if (state.kind === "authorization" && pending) {
      return (
        <AuthorizationPanel
          title={state.title}
          pending={pending}
          onDecide={decide}
        />
      )
    }

    return (
      <div className="plasmo-space-y-3">
        {state.kind === "error" && <ErrorText>{state.error}</ErrorText>}
        <WalletDashboard />
      </div>
    )
  }

  return (
    <div className="plasmo-w-[400px]">
      <main className="plasmo-bg-white plasmo-p-4 plasmo-text-black">
        {body()}
      </main>
    </div>
  )
}

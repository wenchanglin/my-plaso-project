import React from "react"

import { useWalletStore } from "../../stores/walletStore.ts"
import { primaryButtonClass } from "./controls.tsx"

/**
 * Shown once, right after creation. It lives outside `WalletSetup` because
 * writing the vault flips the popup to the account screen and unmounts it.
 */
export function BackupPhrase({ phrase }: { phrase: string }) {
  const clearPendingBackup = useWalletStore((state) => state.clearPendingBackup)

  return (
    <section className="plasmo-space-y-3">
      <h1 className="plasmo-text-base plasmo-font-semibold">备份助记词</h1>
      <p className="plasmo-text-xs plasmo-text-neutral-600">
        这是唯一一次显示，抄写到离线的地方。丢失后无法找回资产。
      </p>
      <p className="plasmo-select-all plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-sm plasmo-leading-6">
        {phrase}
      </p>
      <button
        type="button"
        className={primaryButtonClass}
        onClick={clearPendingBackup}>
        我已抄写
      </button>
    </section>
  )
}

import React, { useState } from "react"

import type { PendingAuthorization } from "../../lib/authorization.ts"
import { selectCurrentAccount, useWalletStore } from "../../stores/walletStore.ts"
import {
  ErrorText,
  primaryButtonClass,
  secondaryButtonClass,
  shortAddress
} from "./controls.tsx"

const REQUEST_LABELS: Record<PendingAuthorization["type"], string> = {
  WALLET_CONNECT: "连接钱包",
  WALLET_GET_ACCOUNT: "读取账户",
  WALLET_SIGN_MESSAGE: "签名消息",
  WALLET_DISCONNECT: "断开连接",
  ETHEREUM_REQUEST: "以太坊请求"
}

/**
 * Shown only while the service worker is blocked on a decision. Rendering this
 * screen requires an unlocked wallet, so approving never leaves the worker with
 * a connection it cannot serve.
 */
export function AuthorizationPanel({
  title,
  pending,
  onDecide
}: {
  title: string
  pending: PendingAuthorization
  onDecide: (approved: boolean) => Promise<void>
}) {
  const currentAccount = useWalletStore(selectCurrentAccount)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const decide = async (approved: boolean) => {
    setError(null)
    setIsBusy(true)
    try {
      await onDecide(approved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交决定失败")
      setIsBusy(false)
    }
  }

  return (
    <section className="plasmo-space-y-3">
      <h1 className="plasmo-text-base plasmo-font-semibold">{title}</h1>

      <dl className="plasmo-space-y-1 plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-xs">
        <div className="plasmo-flex plasmo-justify-between plasmo-gap-2">
          <dt className="plasmo-text-neutral-500">站点</dt>
          <dd className="plasmo-truncate plasmo-font-medium">{pending.origin}</dd>
        </div>
        <div className="plasmo-flex plasmo-justify-between plasmo-gap-2">
          <dt className="plasmo-text-neutral-500">请求</dt>
          <dd className="plasmo-font-medium">{REQUEST_LABELS[pending.type]}</dd>
        </div>
        <div className="plasmo-flex plasmo-justify-between plasmo-gap-2">
          <dt className="plasmo-text-neutral-500">账户</dt>
          <dd className="plasmo-font-medium">
            {currentAccount ? shortAddress(currentAccount.address) : "-"}
          </dd>
        </div>
      </dl>

      {pending.message !== undefined && (
        <div className="plasmo-space-y-1">
          <p className="plasmo-text-xs plasmo-font-medium plasmo-text-neutral-600">
            待签名内容
          </p>
          <p className="plasmo-max-h-32 plasmo-overflow-auto plasmo-whitespace-pre-wrap plasmo-break-all plasmo-rounded plasmo-border plasmo-border-neutral-200 plasmo-p-2 plasmo-text-xs">
            {pending.message}
          </p>
        </div>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="plasmo-flex plasmo-gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={isBusy}
          onClick={() => void decide(false)}>
          拒绝
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={isBusy}
          onClick={() => void decide(true)}>
          同意
        </button>
      </div>
    </section>
  )
}

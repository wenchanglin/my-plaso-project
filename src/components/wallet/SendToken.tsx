/**
 * ERC-20 transfer, reached from a row in the token list.
 *
 * A separate screen rather than an asset picker inside `SendTransaction`: the
 * popup has no `Select` component, and the native form's confirm step is pinned
 * verbatim by `tests/popup-dashboard.test.mjs`.
 */
import { AlertTriangle, CheckCircle, ExternalLink, Send } from "lucide-react"
import React, { useState } from "react"

import { useNativeBalance } from "../../hooks/use-native-balance.ts"
import { createTokenTransfer } from "../../lib/token.ts"
import {
  selectCurrentAccount,
  selectCurrentNetwork,
  useWalletStore
} from "../../stores/walletStore.ts"
import type { TrackedToken } from "../../types/wallet.ts"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx"
import { toast } from "../ui/sonner"
import {
  ErrorText,
  Field,
  hintClass,
  iconClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  shortAddress
} from "./controls.tsx"

export function SendToken({
  token,
  /** Already read by the list, so this screen needs no chain call of its own. */
  balance,
  onSent,
  onClose
}: {
  token: TrackedToken
  balance: string
  onSent: () => void
  onClose: () => void
}) {
  const account = useWalletStore(selectCurrentAccount)
  const network = useWalletStore(selectCurrentNetwork)
  const sendTransaction = useWalletStore((state) => state.sendTransactionFor)
  // Only for the fee warning: gas is paid in the native coin, so a token balance
  // says nothing about whether this transaction can be mined.
  const native = useNativeBalance()

  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const noNativeCoin = native.balance !== null && Number(native.balance) === 0

  const prepare = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!account) {
      setError("没有可用账户")
      return
    }

    try {
      createTokenTransfer(token, recipient, amount, balance)
      setConfirming(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "转账参数无效")
    }
  }

  const execute = async () => {
    if (!account) return
    setError(null)
    setIsSending(true)
    try {
      const transfer = createTokenTransfer(token, recipient, amount, balance)
      // `to` is the token contract and the amount rides in `data`, so unlike a
      // native transfer this carries no `value`.
      const hash = await sendTransaction(
        account.address,
        { to: transfer.to, data: transfer.data },
        network
      )
      setTxHash(hash)
      setConfirming(false)
      onSent()
      toast.success("交易已发送")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发送交易失败")
    } finally {
      setIsSending(false)
    }
  }

  if (txHash) {
    const explorerUrl = network.blockExplorerUrl
      ? `${network.blockExplorerUrl.replace(/\/$/, "")}/tx/${txHash}`
      : null
    return (
      <Card className="plasmo-rounded-lg">
        <CardContent className="plasmo-space-y-3 plasmo-p-4">
          <div className="plasmo-flex plasmo-items-center plasmo-gap-2 plasmo-text-green-700">
            <CheckCircle className={iconClass} />
            <h2 className="plasmo-text-sm plasmo-font-semibold">交易已发送</h2>
          </div>
          <p className="plasmo-text-xs plasmo-text-neutral-500">
            {amount} {token.symbol} 已提交到 {network.name}，等待网络确认。
          </p>
          <p className="plasmo-break-all plasmo-rounded plasmo-bg-neutral-100 plasmo-p-2 plasmo-font-mono plasmo-text-[11px]">
            {txHash}
          </p>
          <div className="plasmo-flex plasmo-gap-2">
            {explorerUrl ? (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}>
                <span className="plasmo-inline-flex plasmo-items-center plasmo-justify-center plasmo-gap-1">
                  <ExternalLink className={iconClass} />
                  查看交易
                </span>
              </button>
            ) : null}
            <button type="button" className={primaryButtonClass} onClick={onClose}>
              返回代币
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (confirming) {
    return (
      <Card className="plasmo-rounded-lg">
        <CardHeader>
          <CardTitle>
            <AlertTriangle className="plasmo-h-4 plasmo-w-4 plasmo-text-amber-600" />
            确认发送 {token.symbol}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="plasmo-space-y-2 plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-xs">
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">付款账户</dt>
              <dd className="plasmo-font-mono">{shortAddress(account?.address ?? "")}</dd>
            </div>
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">收款地址</dt>
              <dd className="plasmo-max-w-[62%] plasmo-break-all plasmo-text-right plasmo-font-mono">
                {recipient}
              </dd>
            </div>
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">转账数量</dt>
              <dd className="plasmo-font-medium">
                {amount} {token.symbol}
              </dd>
            </div>
            {/* A contract's own `symbol()` can say anything, and fake stablecoins
                are common, so the address is shown next to it rather than trusted
                in its place. */}
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">代币合约</dt>
              <dd className="plasmo-max-w-[62%] plasmo-break-all plasmo-text-right plasmo-font-mono">
                {token.address}
              </dd>
            </div>
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">代币标准</dt>
              <dd>{token.standard}</dd>
            </div>
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">网络</dt>
              <dd>{network.name}</dd>
            </div>
          </dl>
          <p className={hintClass}>
            手续费以 {network.symbol} 支付，不会占用代币余额。
          </p>
          <ErrorText>{error}</ErrorText>
          <div className="plasmo-flex plasmo-gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={isSending}
              onClick={() => setConfirming(false)}>
              返回修改
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={isSending}
              onClick={() => void execute()}>
              {isSending ? "发送中..." : "确认发送"}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="plasmo-rounded-lg">
      <CardHeader>
        <CardTitle>
          <Send className={iconClass} />
          发送 {token.symbol}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="plasmo-space-y-1 plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-xs">
          <div className="plasmo-flex plasmo-items-center plasmo-justify-between">
            <span className="plasmo-text-neutral-500">可用余额</span>
            <span className="plasmo-font-medium">
              {balance} {token.symbol}
            </span>
          </div>
          <p className="plasmo-break-all plasmo-font-mono plasmo-text-[11px] plasmo-text-neutral-500">
            {token.address}
          </p>
        </div>

        <form className="plasmo-space-y-3" onSubmit={prepare}>
          <Field label="收款地址">
            <input
              className={inputClass}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x..."
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </Field>

          <Field label={`数量（${token.symbol}）`}>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          {/* Not a check inside `createTokenTransfer`: emptying a token balance is
              legitimate, it is the empty native balance that blocks the send. */}
          <p className={hintClass}>
            {noNativeCoin
              ? `需要 ${network.symbol} 支付网络手续费`
              : `全部余额都可以转出，手续费另以 ${network.symbol} 支付。`}
          </p>

          <ErrorText>{error ?? native.error}</ErrorText>
          <div className="plasmo-flex plasmo-gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onClose}>
              返回
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={!account || noNativeCoin || !recipient || !amount}>
              <span className="plasmo-inline-flex plasmo-items-center plasmo-justify-center plasmo-gap-1">
                <Send className={iconClass} />
                下一步
              </span>
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

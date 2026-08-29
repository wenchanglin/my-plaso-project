import { AlertTriangle, CheckCircle, ExternalLink, Send } from "lucide-react"
import React, { useState } from "react"

import { useNativeBalance } from "../../hooks/use-native-balance.ts"
import { createNativeTransfer } from "../../lib/transaction.ts"
import {
  selectCurrentAccount,
  selectCurrentNetwork,
  useWalletStore
} from "../../stores/walletStore.ts"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx"
import { toast } from "../ui/sonner"
import {
  ErrorText,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  shortAddress
} from "./controls.tsx"

const iconClass = "plasmo-h-4 plasmo-w-4"

/** Native-coin transfer form for the currently selected account and network. */
export function SendTransaction() {
  const account = useWalletStore(selectCurrentAccount)
  const network = useWalletStore(selectCurrentNetwork)
  const sendTransaction = useWalletStore((state) => state.sendTransactionFor)
  const balance = useNativeBalance()

  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const reset = () => {
    setRecipient("")
    setAmount("")
    setError(null)
    setConfirming(false)
    setTxHash(null)
  }

  const prepare = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!account) {
      setError("没有可用账户")
      return
    }
    if (balance.balance === null) {
      setError(balance.isLoading ? "余额读取中，请稍候" : "暂时无法读取余额")
      return
    }

    try {
      createNativeTransfer(recipient, amount, balance.balance)
      setConfirming(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "转账参数无效")
    }
  }

  const execute = async () => {
    if (!account || balance.balance === null) return
    setError(null)
    setIsSending(true)
    try {
      const transfer = createNativeTransfer(recipient, amount, balance.balance)
      const hash = await sendTransaction(
        account.address,
        { to: transfer.to, value: transfer.value },
        network
      )
      setTxHash(hash)
      setConfirming(false)
      balance.refresh()
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
            交易已提交到 {network.name}，等待网络确认。
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
            <button type="button" className={primaryButtonClass} onClick={reset}>
              新建转账
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
            确认转账
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
              <dt className="plasmo-text-neutral-500">转账金额</dt>
              <dd className="plasmo-font-medium">{amount} {network.symbol}</dd>
            </div>
            <div className="plasmo-flex plasmo-justify-between plasmo-gap-3">
              <dt className="plasmo-text-neutral-500">网络</dt>
              <dd>{network.name}</dd>
            </div>
          </dl>
          <p className="plasmo-text-xs plasmo-leading-relaxed plasmo-text-neutral-500">
            网络手续费由节点估算。发送全部余额时，请预留足够手续费。
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
          发送 {network.symbol}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-xs">
          <span className="plasmo-text-neutral-500">可用余额</span>
          <span className="plasmo-font-medium">
            {balance.balance === null
              ? balance.isLoading ? "读取中..." : "--"
              : `${balance.balance} ${network.symbol}`}
          </span>
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

          <Field label={`金额（${network.symbol}）`}>
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

          <p className="plasmo-text-xs plasmo-leading-relaxed plasmo-text-neutral-500">
            请保留部分 {network.symbol} 支付网络手续费。
          </p>

          <ErrorText>{error ?? balance.error}</ErrorText>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={!account || balance.isLoading || balance.balance === null || !recipient || !amount}>
            <span className="plasmo-inline-flex plasmo-items-center plasmo-justify-center plasmo-gap-1">
              <Send className={iconClass} />
              下一步
            </span>
          </button>
        </form>
      </CardContent>
    </Card>
  )
}

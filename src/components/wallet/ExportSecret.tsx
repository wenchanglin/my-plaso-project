import { Check, Copy, Eye, EyeOff } from "lucide-react"
import React, { useState } from "react"

import { useWalletStore } from "../../stores/walletStore.ts"
import {
  ErrorText,
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass
} from "./controls.tsx"

type ExportSecretProps = { onClose: () => void } & (
  | { kind: "mnemonic" }
  | { kind: "privateKey"; address: string }
)

const COPY = {
  mnemonic: {
    title: "导出助记词",
    warning: "助记词可以恢复整个钱包，任何拿到它的人都能转走资产。"
  },
  privateKey: {
    title: "导出私钥",
    warning: "私钥可以控制这个账户，任何拿到它的人都能转走资产。"
  }
}

const iconClass = "plasmo-h-4 plasmo-w-4"
const rowClass = "plasmo-inline-flex plasmo-items-center plasmo-gap-1"

/**
 * Asks for the password again instead of reusing the session key, so an unlocked
 * popup left open cannot hand out a secret. The plaintext only ever lives in
 * this component's state and goes away with it.
 */
export function ExportSecret(props: ExportSecretProps) {
  const exportMnemonic = useWalletStore((state) => state.exportMnemonic)
  const exportPrivateKey = useWalletStore((state) => state.exportPrivateKey)

  const [password, setPassword] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const { title, warning } = COPY[props.kind]

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsBusy(true)
    try {
      setSecret(
        props.kind === "mnemonic"
          ? await exportMnemonic(password)
          : await exportPrivateKey(props.address, password)
      )
      setPassword("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败")
    } finally {
      setIsBusy(false)
    }
  }

  const copy = async () => {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="plasmo-space-y-3">
      <h1 className="plasmo-text-base plasmo-font-semibold">{title}</h1>
      <p className="plasmo-text-xs plasmo-text-red-600">{warning}</p>
      {secret === null ? (
        <form className="plasmo-space-y-3" onSubmit={onSubmit}>
          <Field label="密码">
            <input
              className={inputClass}
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={isBusy || password.length === 0}>
            {isBusy ? "校验中..." : "确认导出"}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={props.onClose}>
            返回
          </button>
        </form>
      ) : (
        <div className="plasmo-space-y-3">
          <p
            className={`plasmo-select-all plasmo-break-all plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-sm plasmo-leading-6 ${
              revealed ? "" : "plasmo-blur-sm"
            }`}>
            {secret}
          </p>
          <div className="plasmo-flex plasmo-gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setRevealed((on) => !on)}>
              <span className={rowClass}>
                {revealed ? (
                  <EyeOff className={iconClass} />
                ) : (
                  <Eye className={iconClass} />
                )}
                {revealed ? "隐藏" : "显示"}
              </span>
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void copy()}>
              <span className={rowClass}>
                {copied ? (
                  <Check className={iconClass} />
                ) : (
                  <Copy className={iconClass} />
                )}
                {copied ? "已复制" : "复制"}
              </span>
            </button>
          </div>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={props.onClose}>
            完成
          </button>
        </div>
      )}
    </section>
  )
}

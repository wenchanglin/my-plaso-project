import React, { useState } from "react"

import { useWalletStore } from "../../stores/walletStore.ts"
import {
  ErrorText,
  Field,
  inputClass,
  linkButtonClass,
  primaryButtonClass
} from "./controls.tsx"

/**
 * First-run screen. The generated phrase is shown exactly once, right after
 * creation, because it is only readable while the vault key is in memory.
 */
export function WalletSetup() {
  const createWallet = useWalletStore((state) => state.createWallet)
  const importMnemonic = useWalletStore((state) => state.importMnemonic)

  const [mode, setMode] = useState<"create" | "import">("create")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [phrase, setPhrase] = useState("")
  const [backup, setBackup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  if (backup) {
    return (
      <section className="plasmo-space-y-3">
        <h1 className="plasmo-text-base plasmo-font-semibold">备份助记词</h1>
        <p className="plasmo-text-xs plasmo-text-neutral-600">
          这是唯一一次显示，抄写到离线的地方。丢失后无法找回资产。
        </p>
        <p className="plasmo-select-all plasmo-rounded plasmo-bg-neutral-100 plasmo-p-3 plasmo-text-sm plasmo-leading-6">
          {backup}
        </p>
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => setBackup(null)}>
          我已抄写
        </button>
      </section>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("密码至少 8 位")
      return
    }
    if (password !== confirmation) {
      setError("两次输入的密码不一致")
      return
    }

    setIsBusy(true)
    try {
      if (mode === "create") {
        const { mnemonic } = await createWallet(password)
        setBackup(mnemonic)
      } else {
        await importMnemonic(phrase, password)
      }
      setPassword("")
      setConfirmation("")
      setPhrase("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <form className="plasmo-space-y-3" onSubmit={submit}>
      <h1 className="plasmo-text-base plasmo-font-semibold">
        {mode === "create" ? "创建钱包" : "导入助记词"}
      </h1>

      {mode === "import" && (
        <Field label="助记词">
          <textarea
            className={inputClass}
            rows={3}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </Field>
      )}

      <Field label="密码">
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field label="确认密码">
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      <button type="submit" className={primaryButtonClass} disabled={isBusy}>
        {isBusy ? "处理中..." : mode === "create" ? "创建" : "导入"}
      </button>

      <button
        type="button"
        className={linkButtonClass}
        onClick={() => {
          setMode(mode === "create" ? "import" : "create")
          setError(null)
        }}>
        {mode === "create" ? "已有助记词？导入钱包" : "返回创建钱包"}
      </button>
    </form>
  )
}

import React, { useState } from "react"

import { useWalletStore } from "../../stores/walletStore.ts"
import { ErrorText, Field, inputClass, primaryButtonClass } from "./controls.tsx"

export function UnlockWallet() {
  const unlock = useWalletStore((state) => state.unlock)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsBusy(true)

    try {
      // Key derivation is deliberately slow, so the button stays disabled.
      if (await unlock(password)) {
        setPassword("")
      } else {
        setError("密码错误")
      }
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <form className="plasmo-space-y-3" onSubmit={submit}>
      <h1 className="plasmo-text-base plasmo-font-semibold">解锁钱包</h1>

      <Field label="密码">
        <input
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      <button type="submit" className={primaryButtonClass} disabled={isBusy}>
        {isBusy ? "解锁中..." : "解锁"}
      </button>
    </form>
  )
}

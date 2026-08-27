import React, { useState } from "react"

import {
  selectCurrentAccount,
  selectCurrentNetwork,
  selectPublicAccounts,
  useWalletStore
} from "../../stores/walletStore.ts"
import {
  ErrorText,
  Field,
  inputClass,
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
  shortAddress
} from "./controls.tsx"

export function AccountPanel() {
  const accounts = useWalletStore(selectPublicAccounts)
  const currentAccount = useWalletStore(selectCurrentAccount)
  const currentNetwork = useWalletStore(selectCurrentNetwork)
  const networks = useWalletStore((state) => state.networks)
  const connections = useWalletStore((state) => state.connections)

  const createAccount = useWalletStore((state) => state.createAccount)
  const importPrivateKey = useWalletStore((state) => state.importPrivateKey)
  const switchAccount = useWalletStore((state) => state.switchAccount)
  const switchNetwork = useWalletStore((state) => state.switchNetwork)
  const disconnect = useWalletStore((state) => state.disconnect)
  const lock = useWalletStore((state) => state.lock)

  const [privateKey, setPrivateKey] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    setIsBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="plasmo-space-y-4">
      <header className="plasmo-flex plasmo-items-start plasmo-justify-between plasmo-gap-2">
        <div>
          <p className="plasmo-text-sm plasmo-font-semibold">
            {currentAccount?.name ?? "无账户"}
          </p>
          <p className="plasmo-text-xs plasmo-text-neutral-500">
            {currentAccount ? shortAddress(currentAccount.address) : "-"}
          </p>
        </div>
        <button
          type="button"
          className="plasmo-rounded plasmo-border plasmo-border-neutral-300 plasmo-px-2 plasmo-py-1 plasmo-text-xs"
          onClick={() => void lock()}>
          锁定
        </button>
      </header>

      <Field label="网络">
        <select
          className={inputClass}
          value={currentNetwork.id}
          onChange={(event) => switchNetwork(event.target.value)}>
          {networks.map((network) => (
            <option key={network.id} value={network.id}>
              {network.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="账户">
        <select
          className={inputClass}
          value={currentAccount?.address ?? ""}
          onChange={(event) => switchAccount(event.target.value)}>
          {accounts.map((account) => (
            <option key={account.address} value={account.address}>
              {account.name} · {shortAddress(account.address)}
            </option>
          ))}
        </select>
      </Field>

      <div className="plasmo-space-y-2">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={isBusy}
          onClick={() => void run(() => createAccount())}>
          新建账户
        </button>

        {showImport ? (
          <div className="plasmo-space-y-2">
            <Field label="私钥">
              <input
                className={inputClass}
                type="password"
                value={privateKey}
                onChange={(event) => setPrivateKey(event.target.value)}
              />
            </Field>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={isBusy || privateKey.length === 0}
              onClick={() =>
                void run(async () => {
                  await importPrivateKey(privateKey)
                  setPrivateKey("")
                  setShowImport(false)
                })
              }>
              导入
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={linkButtonClass}
            onClick={() => setShowImport(true)}>
            导入私钥
          </button>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="plasmo-space-y-1">
        <p className="plasmo-text-xs plasmo-font-medium plasmo-text-neutral-600">
          已连接站点
        </p>
        {connections.length === 0 ? (
          <p className="plasmo-text-xs plasmo-text-neutral-500">暂无</p>
        ) : (
          <ul className="plasmo-space-y-1">
            {connections.map((origin) => (
              <li
                key={origin}
                className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2 plasmo-text-xs">
                <span className="plasmo-truncate">{origin}</span>
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() => disconnect(origin)}>
                  断开
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

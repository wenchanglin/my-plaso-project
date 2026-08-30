import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Users,
  Wallet,
  Wifi
} from "lucide-react"
import React, { useEffect, useRef, useState } from "react"

import { useNativeBalance } from "../../hooks/use-native-balance.ts"
import {
  selectCurrentAccount,
  selectCurrentNetwork,
  selectPublicAccounts,
  useWalletStore
} from "../../stores/walletStore.ts"
import { Card, CardContent } from "../ui/card.tsx"
import { toast } from "../ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx"
import {
  activeRowClass,
  avatarClass,
  badgeClass,
  centerRowClass,
  dangerButtonClass,
  ErrorText,
  Field,
  hintClass,
  iconButtonClass,
  iconClass,
  idleRowClass,
  inputClass,
  linkButtonClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  SectionHeader,
  shortAddress,
  smallButtonClass
} from "./controls.tsx"
import { ExportSecret } from "./ExportSecret.tsx"
import { SendTransaction } from "./SendTransaction.tsx"
import { TokenList } from "./TokenList.tsx"

/**
 * The screen behind an unlocked wallet: an overview, the accounts, the networks,
 * the tracked tokens, and the origins this wallet is connected to.
 *
 * Ported from the reference `WalletDashboard`. Its hand-rolled nav buttons are
 * the popup's Radix tabs here, with native-coin sending kept in its own form.
 */
export function WalletDashboard() {
  const accounts = useWalletStore(selectPublicAccounts)
  const currentAccount = useWalletStore(selectCurrentAccount)
  const currentNetwork = useWalletStore(selectCurrentNetwork)
  const networks = useWalletStore((state) => state.networks)
  const connections = useWalletStore((state) => state.connections)
  const hasPhrase = useWalletStore(
    (state) => state.vault?.encryptedMnemonic != null
  )

  const createAccount = useWalletStore((state) => state.createAccount)
  const importPrivateKey = useWalletStore((state) => state.importPrivateKey)
  const switchAccount = useWalletStore((state) => state.switchAccount)
  const switchNetwork = useWalletStore((state) => state.switchNetwork)
  const disconnect = useWalletStore((state) => state.disconnect)
  const lock = useWalletStore((state) => state.lock)
  const resetWallet = useWalletStore((state) => state.resetWallet)

  const balance = useNativeBalance()

  const [tab, setTab] = useState("overview")
  const [showBalance, setShowBalance] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [privateKey, setPrivateKey] = useState("")
  const [confirmReset, setConfirmReset] = useState(false)
  const [exporting, setExporting] = useState<"mnemonic" | "privateKey" | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  // The reference left this timer running, which sets state after unmount.
  const copyTimer = useRef<number>()
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

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

  const copyAddress = async () => {
    if (!currentAccount) return
    try {
      await navigator.clipboard.writeText(currentAccount.address)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500)
      toast.success("地址已复制")
    } catch {
      toast.error("复制失败")
    }
  }

  const explorerUrl =
    currentAccount && currentNetwork.blockExplorerUrl
      ? `${currentNetwork.blockExplorerUrl.replace(/\/$/, "")}/address/${currentAccount.address}`
      : null

  if (exporting === "mnemonic") {
    return <ExportSecret kind="mnemonic" onClose={() => setExporting(null)} />
  }

  if (exporting === "privateKey" && currentAccount) {
    return (
      <ExportSecret
        kind="privateKey"
        address={currentAccount.address}
        onClose={() => setExporting(null)}
      />
    )
  }

  return (
    <section className="plasmo-space-y-3">
      <header className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
        <div className="plasmo-flex plasmo-min-w-0 plasmo-items-center plasmo-gap-2">
          <div className="plasmo-flex plasmo-h-9 plasmo-w-9 plasmo-shrink-0 plasmo-items-center plasmo-justify-center plasmo-rounded-full plasmo-bg-neutral-900">
            <Wallet className={`${iconClass} plasmo-text-white`} />
          </div>
          <div className="plasmo-min-w-0">
            <h1 className="plasmo-text-sm plasmo-font-bold">MyWallet</h1>
            <p className="plasmo-truncate plasmo-text-xs plasmo-text-neutral-500">
              {currentAccount?.name ?? "无账户"}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="锁定钱包"
          title="锁定钱包"
          className="plasmo-shrink-0 plasmo-rounded plasmo-border plasmo-border-neutral-300 plasmo-p-2 plasmo-text-neutral-600 hover:plasmo-text-neutral-900"
          onClick={() => void lock()}>
          <Lock className={iconClass} />
        </button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="send">转账</TabsTrigger>
          {/* Two characters, like its neighbours: six triggers share 368px with
              `flex-1`, and a third character wraps the row. */}
          <TabsTrigger value="tokens">代币</TabsTrigger>
          <TabsTrigger value="accounts">账户</TabsTrigger>
          <TabsTrigger value="networks">网络</TabsTrigger>
          <TabsTrigger value="connections">连接</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="plasmo-space-y-3">
            {/*
              A plain element rather than `Card`: the dark treatment would have
              to override `Card`'s own `bg-white`, and Tailwind emits `bg-white`
              after `bg-neutral-900`, so the override loses and the text turns
              white on white.
            */}
            <div className="plasmo-space-y-3 plasmo-rounded-xl plasmo-bg-gradient-to-br plasmo-from-neutral-800 plasmo-to-neutral-950 plasmo-p-4 plasmo-text-white plasmo-shadow-sm">
              <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
                <span className="plasmo-text-xs plasmo-text-neutral-400">
                  当前账户
                </span>
                <span className="plasmo-flex plasmo-max-w-[60%] plasmo-items-center plasmo-gap-1.5 plasmo-rounded-full plasmo-bg-white/10 plasmo-px-2 plasmo-py-0.5 plasmo-text-xs plasmo-text-neutral-200">
                  <span className="plasmo-h-1.5 plasmo-w-1.5 plasmo-shrink-0 plasmo-rounded-full plasmo-bg-green-400" />
                  <span className="plasmo-truncate">{currentNetwork.name}</span>
                </span>
              </div>

              <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
                <p className="plasmo-truncate plasmo-text-lg plasmo-font-bold">
                  {currentAccount?.name ?? "无账户"}
                </p>
                {currentAccount ? (
                  <button
                    type="button"
                    aria-label="复制地址"
                    title="复制地址"
                    className="plasmo-shrink-0 plasmo-rounded plasmo-p-1 plasmo-text-neutral-300 hover:plasmo-bg-white/10 hover:plasmo-text-white"
                    onClick={() => void copyAddress()}>
                    {copied ? (
                      <Check className={iconClass} />
                    ) : (
                      <Copy className={iconClass} />
                    )}
                  </button>
                ) : null}
              </div>

              <p className="plasmo-font-mono plasmo-text-xs plasmo-text-neutral-300">
                {currentAccount ? shortAddress(currentAccount.address) : "-"}
              </p>
            </div>

            <Card className="plasmo-rounded-lg">
              <CardContent>
                <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
                  <span className="plasmo-text-xs plasmo-font-medium plasmo-text-neutral-600">
                    钱包余额
                  </span>
                  <div className="plasmo-flex plasmo-items-center plasmo-gap-1">
                    <button
                      type="button"
                      aria-label={showBalance ? "隐藏余额" : "显示余额"}
                      className={iconButtonClass}
                      onClick={() => setShowBalance(!showBalance)}>
                      {showBalance ? (
                        <EyeOff className={iconClass} />
                      ) : (
                        <Eye className={iconClass} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="刷新余额"
                      className={iconButtonClass}
                      disabled={balance.isLoading}
                      onClick={balance.refresh}>
                      <RefreshCw
                        className={`${iconClass} ${balance.isLoading ? "plasmo-animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                <div className="plasmo-flex plasmo-items-baseline plasmo-gap-1.5">
                  <p className="plasmo-text-2xl plasmo-font-bold plasmo-tabular-nums">
                    {!showBalance
                      ? "••••••"
                      : balance.balance === null
                        ? balance.isLoading
                          ? "读取中..."
                          : "--"
                        : balance.balance}
                  </p>
                  {showBalance && balance.balance !== null ? (
                    <span className="plasmo-text-sm plasmo-font-medium plasmo-text-neutral-500">
                      {currentNetwork.symbol}
                    </span>
                  ) : null}
                </div>

                <ErrorText>{balance.error}</ErrorText>
              </CardContent>
            </Card>

            <div className="plasmo-grid plasmo-grid-cols-2 plasmo-gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => setTab("accounts")}>
                <span className={centerRowClass}>
                  <Users className={iconClass} />
                  管理账户
                </span>
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={explorerUrl === null}
                title={
                  explorerUrl === null ? "该网络没有配置区块浏览器" : undefined
                }
                onClick={() =>
                  explorerUrl &&
                  window.open(explorerUrl, "_blank", "noopener,noreferrer")
                }>
                <span className={centerRowClass}>
                  <ExternalLink className={iconClass} />
                  区块浏览器
                </span>
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="send">
          <SendTransaction />
        </TabsContent>

        <TabsContent value="tokens">
          <TokenList />
        </TabsContent>

        <TabsContent value="accounts">
          <div className="plasmo-space-y-3">
            <SectionHeader title="账户管理">
              <div className="plasmo-flex plasmo-gap-2">
                <button
                  type="button"
                  className={smallButtonClass}
                  disabled={isBusy || !hasPhrase}
                  title={hasPhrase ? undefined : "这个钱包没有助记词"}
                  onClick={() => void run(() => createAccount())}>
                  <Plus className="plasmo-h-3.5 plasmo-w-3.5" />
                  新建
                </button>
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={() => {
                    setPrivateKey("")
                    setShowImport(!showImport)
                  }}>
                  <KeyRound className="plasmo-h-3.5 plasmo-w-3.5" />
                  导入私钥
                </button>
              </div>
            </SectionHeader>

            {hasPhrase ? null : (
              <p className={hintClass}>
                这个钱包是用私钥导入的，没有助记词，无法派生新账户。
              </p>
            )}

            <div className="plasmo-space-y-2">
              {accounts.map((account) => {
                const isCurrent = account.address === currentAccount?.address
                return (
                  <button
                    key={account.address}
                    type="button"
                    aria-current={isCurrent}
                    className={`${rowClass} plasmo-items-center plasmo-gap-3 ${isCurrent ? activeRowClass : idleRowClass}`}
                    onClick={() => switchAccount(account.address)}>
                    <span
                      className={`${avatarClass} ${
                        isCurrent
                          ? "plasmo-bg-neutral-900 plasmo-text-white"
                          : "plasmo-bg-neutral-100 plasmo-text-neutral-500"
                      }`}>
                      <Wallet className={iconClass} />
                    </span>
                    <span className="plasmo-min-w-0 plasmo-flex-1">
                      <span className="plasmo-block plasmo-truncate plasmo-text-sm plasmo-font-medium">
                        {account.name}
                      </span>
                      <span className="plasmo-block plasmo-truncate plasmo-font-mono plasmo-text-xs plasmo-text-neutral-500">
                        {shortAddress(account.address)}
                      </span>
                    </span>
                    {isCurrent ? (
                      <span className={badgeClass}>当前</span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {showImport ? (
              <Card className="plasmo-rounded-lg plasmo-border-dashed">
                <CardContent>
                  <Field label="私钥">
                    <input
                      className={inputClass}
                      type="password"
                      autoComplete="off"
                      placeholder="0x 开头的 64 位十六进制字符"
                      value={privateKey}
                      onChange={(event) => setPrivateKey(event.target.value)}
                    />
                  </Field>
                  <div className="plasmo-flex plasmo-gap-2">
                    <button
                      type="button"
                      className={primaryButtonClass}
                      disabled={isBusy || privateKey.length === 0}
                      onClick={() =>
                        void run(async () => {
                          await importPrivateKey(privateKey.trim())
                          setPrivateKey("")
                          setShowImport(false)
                          toast.success("私钥导入成功")
                        })
                      }>
                      导入
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => {
                        setPrivateKey("")
                        setShowImport(false)
                      }}>
                      取消
                    </button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="plasmo-flex plasmo-gap-4 plasmo-border-t plasmo-border-neutral-200 plasmo-pt-3">
              {hasPhrase ? (
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() => setExporting("mnemonic")}>
                  导出助记词
                </button>
              ) : null}
              {currentAccount ? (
                <button
                  type="button"
                  className={linkButtonClass}
                  onClick={() => setExporting("privateKey")}>
                  导出私钥
                </button>
              ) : null}
            </div>

            <ErrorText>{error}</ErrorText>

            <div className="plasmo-rounded-lg plasmo-border plasmo-border-red-200 plasmo-bg-red-50 plasmo-p-3">
              {confirmReset ? (
                <div className="plasmo-space-y-2">
                  <p className="plasmo-text-xs plasmo-text-red-600">
                    将删除本地的保险箱、账户和授权记录。没有备份助记词的话资产无法恢复。
                  </p>
                  <div className="plasmo-flex plasmo-gap-2">
                    <button
                      type="button"
                      className="plasmo-flex-1 plasmo-rounded plasmo-bg-red-600 plasmo-px-3 plasmo-py-2 plasmo-text-sm plasmo-font-medium plasmo-text-white disabled:plasmo-opacity-40"
                      disabled={isBusy}
                      onClick={() => void run(resetWallet)}>
                      确认重置
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setConfirmReset(false)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
                  <div className="plasmo-min-w-0">
                    <p className="plasmo-text-xs plasmo-font-semibold plasmo-text-red-700">
                      重置钱包
                    </p>
                    <p className="plasmo-text-xs plasmo-text-red-600">
                      清空本地保险箱与授权记录
                    </p>
                  </div>
                  <button
                    type="button"
                    className="plasmo-shrink-0 plasmo-rounded plasmo-border plasmo-border-red-300 plasmo-bg-white plasmo-px-2 plasmo-py-1 plasmo-text-xs plasmo-font-medium plasmo-text-red-600 hover:plasmo-border-red-600"
                    onClick={() => setConfirmReset(true)}>
                    重置
                  </button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="networks">
          <div className="plasmo-space-y-3">
            <SectionHeader title="网络管理">
              <span className="plasmo-text-xs plasmo-text-neutral-500">
                {networks.length} 个网络
              </span>
            </SectionHeader>

            <div className="plasmo-space-y-2">
              {networks.map((network) => {
                const isCurrent = network.id === currentNetwork.id
                return (
                  <button
                    key={network.id}
                    type="button"
                    aria-current={isCurrent}
                    className={`${rowClass} plasmo-flex-col plasmo-gap-1.5 ${isCurrent ? activeRowClass : idleRowClass}`}
                    onClick={() => switchNetwork(network.id)}>
                    <span className="plasmo-flex plasmo-items-center plasmo-gap-2">
                      <span
                        className={`plasmo-h-2 plasmo-w-2 plasmo-shrink-0 plasmo-rounded-full ${
                          isCurrent
                            ? "plasmo-bg-green-500"
                            : "plasmo-bg-neutral-300"
                        }`}
                      />
                      <span className="plasmo-min-w-0 plasmo-flex-1">
                        <span className="plasmo-block plasmo-truncate plasmo-text-sm plasmo-font-medium">
                          {network.name}
                        </span>
                        <span className="plasmo-block plasmo-text-xs plasmo-text-neutral-500">
                          Chain ID {network.chainId} · {network.symbol}
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="plasmo-inline-flex plasmo-shrink-0 plasmo-items-center plasmo-gap-1 plasmo-text-xs plasmo-text-green-600">
                          <Wifi className="plasmo-h-3.5 plasmo-w-3.5" />
                          已连接
                        </span>
                      ) : null}
                    </span>
                    <span className="plasmo-truncate plasmo-font-mono plasmo-text-[11px] plasmo-text-neutral-400">
                      {network.rpcUrl}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className={hintClass}>
              网络来自内置的 DEFAULT_NETWORKS，切换后余额会重新读取。
            </p>
          </div>
        </TabsContent>

        <TabsContent value="connections">
          <div className="plasmo-space-y-3">
            <SectionHeader title="已连接站点">
              <span className="plasmo-text-xs plasmo-text-neutral-500">
                {connections.length} 个站点
              </span>
            </SectionHeader>

            {connections.length === 0 ? (
              <div className="plasmo-space-y-2 plasmo-rounded-lg plasmo-border plasmo-border-dashed plasmo-border-neutral-300 plasmo-p-6 plasmo-text-center">
                <Globe className="plasmo-mx-auto plasmo-h-6 plasmo-w-6 plasmo-text-neutral-300" />
                <p className={hintClass}>
                  暂无。站点调用 connect() 并获得同意后会出现在这里。
                </p>
              </div>
            ) : (
              <ul className="plasmo-space-y-2">
                {connections.map((origin) => (
                  <li
                    key={origin}
                    className={`${rowClass} plasmo-items-center plasmo-gap-3 ${idleRowClass}`}>
                    <span
                      className={`${avatarClass} plasmo-bg-neutral-100 plasmo-text-neutral-500`}>
                      <Globe className={iconClass} />
                    </span>
                    <span className="plasmo-min-w-0 plasmo-flex-1 plasmo-truncate plasmo-font-mono plasmo-text-xs">
                      {origin}
                    </span>
                    <button
                      type="button"
                      className={`${smallButtonClass} ${dangerButtonClass}`}
                      onClick={() => disconnect(origin)}>
                      断开
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

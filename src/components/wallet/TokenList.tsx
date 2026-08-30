/**
 * The 代币 tab: tracked tokens with their balances, an add form, and the entry
 * point to the ERC-20 send screen.
 *
 * Three views behind two pieces of state rather than a modal, matching the rest
 * of the popup: the project has no `Dialog`, and the send screen takes over the
 * whole tab the way `ExportSecret` does on the dashboard.
 *
 * Ported from the reference `TokenManager`, minus its remote `image` URL — that
 * rendered a user-supplied host into `<img src>`, handing the wallet's holdings
 * and the user's IP to whoever owned it. A first-letter avatar costs nothing.
 */
import { isAddress, JsonRpcProvider } from "ethers"
import { Coins, Plus, RefreshCw, Send, Search } from "lucide-react"
import React, { useState } from "react"

import { useTokenBalances } from "../../hooks/use-token-balances.ts"
import {
  codeVia,
  createTrackedToken,
  detectTokenStandard,
  ethCallVia,
  readTokenMetadata
} from "../../lib/token.ts"
import {
  selectCurrentNetwork,
  selectTokensForCurrentNetwork,
  useWalletStore
} from "../../stores/walletStore.ts"
import type { TokenStandard, TrackedToken } from "../../types/wallet.ts"
import {
  avatarClass,
  badgeClass,
  centerRowClass,
  dangerButtonClass,
  ErrorText,
  Field,
  hintClass,
  iconClass,
  idleRowClass,
  inputClass,
  primaryButtonClass,
  rowClass,
  SectionHeader,
  shortAddress,
  smallButtonClass
} from "./controls.tsx"
import { SendToken } from "./SendToken.tsx"

const STANDARDS: { value: TokenStandard; label: string }[] = [
  { value: "ERC20", label: "ERC-20" },
  { value: "ERC721", label: "ERC-721" },
  { value: "ERC1155", label: "ERC-1155" }
]

const standardLabel = (standard: TokenStandard): string =>
  STANDARDS.find(({ value }) => value === standard)?.label ?? standard

/**
 * What the number means differs per standard, so the unit is chosen here rather
 * than pretending all three are quantities of a divisible token.
 */
const describeBalance = (token: TrackedToken, value: string): string => {
  if (token.standard === "ERC20") return `${value} ${token.symbol}`
  // A single ERC-721 id is a yes/no question: `ownerOf` answered 1 or 0.
  if (token.standard === "ERC721" && token.tokenId) {
    return value === "1" ? "持有" : "未持有"
  }
  return `${value} 个`
}

export function TokenList() {
  const network = useWalletStore(selectCurrentNetwork)
  const tokens = useWalletStore(selectTokensForCurrentNetwork)
  const addToken = useWalletStore((state) => state.addToken)
  const removeToken = useWalletStore((state) => state.removeToken)
  const { balances, isLoading, refresh } = useTokenBalances()

  const [sending, setSending] = useState<TrackedToken | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [address, setAddress] = useState("")
  const [standard, setStandard] = useState<TokenStandard | "">("")
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  // Empty rather than "18": the reference implementation's `parseInt(x) || 18`
  // turned a deliberately typed 0 into 18 and divided every balance by 10^18.
  const [decimals, setDecimals] = useState("")
  const [tokenId, setTokenId] = useState("")

  const closeForm = () => {
    setShowAdd(false)
    setDetecting(false)
    setFormError(null)
    setAddress("")
    setStandard("")
    setSymbol("")
    setName("")
    setDecimals("")
    setTokenId("")
  }

  // A message left over from a failed detection reads as "my correction did not
  // take", so editing either field it could have been about clears it.
  const editAddress = (value: string) => {
    setFormError(null)
    setAddress(value)
  }

  const chooseStandard = (value: TokenStandard | "") => {
    setFormError(null)
    setStandard(value)
  }

  const detect = async () => {
    setFormError(null)
    const candidate = address.trim()
    if (!isAddress(candidate)) {
      setFormError("无效的合约地址")
      return
    }

    setDetecting(true)
    // One-shot provider, destroyed below: the button is the only reader, so there
    // is nothing to keep open between clicks.
    const provider = new JsonRpcProvider(network.rpcUrl, network.chainId, {
      staticNetwork: true
    })

    try {
      const call = ethCallVia(provider)
      // `codeVia` is what separates "wrong network" and "not a token contract"
      // from each other in the failure message.
      const detected = await detectTokenStandard(call, candidate, codeVia(provider))
      const metadata = await readTokenMetadata(call, detected, candidate)

      setStandard(detected)
      // Only overwrite with something: ERC-1155 has no on-chain name or symbol,
      // and a `bytes32` symbol comes back empty, so whatever the user typed wins.
      if (metadata.symbol) setSymbol(metadata.symbol)
      if (metadata.name) setName(metadata.name)
      setDecimals(String(metadata.decimals))
    } catch (cause) {
      // Detection failing is recoverable, never a dead end: the picker below stays
      // editable so the user can name the standard themselves.
      setFormError(cause instanceof Error ? cause.message : "识别失败，请手动选择标准")
    } finally {
      provider.destroy()
      setDetecting(false)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!standard) {
      setFormError("请选择代币标准")
      return
    }
    if (standard === "ERC20" && !decimals.trim()) {
      setFormError("请输入代币精度")
      return
    }

    try {
      const token = createTrackedToken({
        chainId: network.chainId,
        standard,
        address,
        symbol,
        name,
        decimals: Number(decimals),
        tokenId
      })

      // The store ignores a duplicate silently, which would look like a no-op.
      if (tokens.some(({ key }) => key === token.key)) {
        setFormError("该代币已在列表中")
        return
      }

      addToken(token)
      closeForm()
      refresh()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "代币信息无效")
    }
  }

  // Takes over the whole tab, the way `ExportSecret` does on the dashboard.
  if (sending) {
    return (
      <SendToken
        token={sending}
        balance={balances[sending.key]?.value ?? "0"}
        onSent={refresh}
        onClose={() => setSending(null)}
      />
    )
  }

  if (showAdd) {
    return (
      <form className="plasmo-space-y-3" onSubmit={submit}>
        <SectionHeader title="添加代币">
          <button type="button" className={smallButtonClass} onClick={closeForm}>
            取消
          </button>
        </SectionHeader>

        <Field label="合约地址">
          <div className="plasmo-flex plasmo-gap-2">
            <input
              className={inputClass}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x..."
              value={address}
              onChange={(event) => editAddress(event.target.value)}
            />
            <button
              type="button"
              className={smallButtonClass}
              disabled={detecting || !address}
              onClick={() => void detect()}>
              <Search className={iconClass} />
              {detecting ? "识别中" : "检测"}
            </button>
          </div>
        </Field>

        <Field label="代币标准">
          <select
            className={inputClass}
            value={standard}
            onChange={(event) =>
              chooseStandard(event.target.value as TokenStandard | "")
            }>
            <option value="">请选择或点击检测</option>
            {STANDARDS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="代币符号">
          <input
            className={inputClass}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="USDC"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
          />
        </Field>

        <Field label="代币名称（可选）">
          <input
            className={inputClass}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="USD Coin"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        {/* Whole-unit standards have no decimals: `createTrackedToken` forces 0,
            so asking would only invite a wrong answer. */}
        {standard === "ERC20" ? (
          <Field label="代币精度">
            <input
              className={inputClass}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="18"
              value={decimals}
              onChange={(event) => setDecimals(event.target.value)}
            />
          </Field>
        ) : null}

        {standard === "ERC721" || standard === "ERC1155" ? (
          <Field
            label={standard === "ERC1155" ? "Token ID" : "Token ID（可选）"}>
            <input
              className={inputClass}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1"
              value={tokenId}
              onChange={(event) => setTokenId(event.target.value)}
            />
          </Field>
        ) : null}

        {/* Both standards behave in ways a user would otherwise read as a bug:
            an NFT collection showing a count instead of the pieces it holds, and
            a 1155 with no name of its own. */}
        {standard === "ERC721" && !tokenId.trim() ? (
          <p className={hintClass}>
            余额为持有数量。本钱包不索引具体 tokenId，要跟踪单个 NFT 请填写 Token ID。
          </p>
        ) : null}
        {standard === "ERC1155" ? (
          <p className={hintClass}>
            ERC-1155 合约没有链上名称，请自行填写名称，并指定 Token ID。
          </p>
        ) : null}

        <ErrorText>{formError}</ErrorText>

        <button type="submit" className={primaryButtonClass} disabled={detecting}>
          <span className={centerRowClass}>
            <Plus className={iconClass} />
            添加
          </span>
        </button>
      </form>
    )
  }

  return (
    <div className="plasmo-space-y-3">
      <SectionHeader title="代币">
        <div className="plasmo-flex plasmo-shrink-0 plasmo-gap-2">
          {/* One refresh for the batch, not one per row: the hook reads every
              tracked token in a single pass. */}
          <button
            type="button"
            className={smallButtonClass}
            disabled={isLoading || tokens.length === 0}
            onClick={refresh}>
            <RefreshCw className={iconClass} />
            {isLoading ? "读取中" : "刷新"}
          </button>
          <button
            type="button"
            className={smallButtonClass}
            onClick={() => setShowAdd(true)}>
            <Plus className={iconClass} />
            添加
          </button>
        </div>
      </SectionHeader>

      <p className={hintClass}>
        代币按网络记录，当前显示 {network.name} 上跟踪的代币。
      </p>

      {tokens.length === 0 ? (
        <div className="plasmo-space-y-2 plasmo-rounded-lg plasmo-border plasmo-border-dashed plasmo-border-neutral-300 plasmo-p-6 plasmo-text-center">
          <Coins className="plasmo-mx-auto plasmo-h-6 plasmo-w-6 plasmo-text-neutral-400" />
          <p className={hintClass}>
            还没有跟踪任何代币。按合约地址添加 ERC-20 / ERC-721 / ERC-1155。
          </p>
        </div>
      ) : (
        <ul className="plasmo-space-y-2">
          {tokens.map((token) => {
            const state = balances[token.key]
            return (
              <li
                key={token.key}
                className={`${rowClass} ${idleRowClass} plasmo-items-center plasmo-gap-3`}>
                {/* First letter instead of the reference implementation's remote
                    `image` URL — see the note at the top of this file. */}
                <span
                  className={`${avatarClass} plasmo-bg-neutral-900 plasmo-text-white`}>
                  {(token.symbol.trim() || "?").slice(0, 1).toUpperCase()}
                </span>

                <div className="plasmo-min-w-0 plasmo-flex-1">
                  <div className="plasmo-flex plasmo-items-center plasmo-gap-2">
                    <span className="plasmo-truncate plasmo-text-sm plasmo-font-medium">
                      {token.symbol}
                    </span>
                    <span className={badgeClass}>{standardLabel(token.standard)}</span>
                  </div>
                  {/* A contract's own `symbol()` can claim anything, so the
                      address travels with it everywhere it is shown. */}
                  <p className="plasmo-font-mono plasmo-text-[11px] plasmo-text-neutral-500">
                    {shortAddress(token.address)}
                    {token.tokenId ? ` · #${token.tokenId}` : ""}
                  </p>
                  {state?.error ? (
                    <p className="plasmo-text-[11px] plasmo-text-red-600">
                      {state.error}
                    </p>
                  ) : (
                    <p className="plasmo-text-xs plasmo-text-neutral-600">
                      {state?.value !== null && state?.value !== undefined
                        ? describeBalance(token, state.value)
                        : isLoading
                          ? "读取中..."
                          : "--"}
                    </p>
                  )}
                </div>

                <div className="plasmo-flex plasmo-shrink-0 plasmo-flex-col plasmo-gap-1">
                  {/* 721/1155 need `safeTransferFrom`, which `createTokenTransfer`
                      refuses, so the button only exists where it works. */}
                  {token.standard === "ERC20" ? (
                    <button
                      type="button"
                      className={smallButtonClass}
                      onClick={() => setSending(token)}>
                      <Send className={iconClass} />
                      发送
                    </button>
                  ) : null}
                  {/* No second confirmation: removing stops tracking, it does not
                      touch the assets. */}
                  <button
                    type="button"
                    className={`${smallButtonClass} ${dangerButtonClass}`}
                    onClick={() => removeToken(token.key)}>
                    移除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

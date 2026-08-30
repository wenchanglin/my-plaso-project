/**
 * Shared popup controls: the class strings and thin wrappers that keep the markup
 * readable in a 400px popup without pulling in a component library.
 *
 * The list vocabulary below started out private to `WalletDashboard`. It moved
 * here when the token screens needed the same rows — a module-level constant in a
 * sibling file is unreachable, and a second copy would drift.
 */
import React from "react"

export const inputClass =
  "plasmo-w-full plasmo-rounded plasmo-border plasmo-border-neutral-300 plasmo-px-3 plasmo-py-2 plasmo-text-sm plasmo-outline-none focus:plasmo-border-neutral-900"

export const primaryButtonClass =
  "plasmo-w-full plasmo-rounded plasmo-bg-neutral-900 plasmo-px-3 plasmo-py-2 plasmo-text-sm plasmo-font-medium plasmo-text-white disabled:plasmo-opacity-40"

export const secondaryButtonClass =
  "plasmo-w-full plasmo-rounded plasmo-border plasmo-border-neutral-300 plasmo-bg-white plasmo-px-3 plasmo-py-2 plasmo-text-sm plasmo-font-medium plasmo-text-neutral-900 disabled:plasmo-opacity-40"

export const linkButtonClass =
  "plasmo-text-xs plasmo-text-neutral-500 plasmo-underline"

export const iconClass = "plasmo-h-4 plasmo-w-4"

export const centerRowClass = "plasmo-inline-flex plasmo-items-center plasmo-gap-1"

export const iconButtonClass =
  "plasmo-rounded plasmo-p-1 plasmo-text-neutral-500 hover:plasmo-text-neutral-900 disabled:plasmo-opacity-40"

/**
 * The 账户, 网络, 连接 and 代币 tabs are all lists of one thing, so they share a
 * card shape: an avatar or a status dot, two lines of text, and a trailing
 * marker. Direction and gap stay with each caller rather than being overridden
 * here — Tailwind resolves a conflict by stylesheet order, not attribute order.
 */
export const rowClass =
  "plasmo-flex plasmo-w-full plasmo-rounded-lg plasmo-border plasmo-p-3 plasmo-text-left plasmo-transition-colors"

export const idleRowClass =
  "plasmo-border-neutral-200 hover:plasmo-border-neutral-300 hover:plasmo-bg-neutral-50"

export const activeRowClass =
  "plasmo-border-neutral-900 plasmo-bg-neutral-50 plasmo-shadow-sm"

export const avatarClass =
  "plasmo-flex plasmo-h-9 plasmo-w-9 plasmo-shrink-0 plasmo-items-center plasmo-justify-center plasmo-rounded-full plasmo-text-xs plasmo-font-semibold"

export const badgeClass =
  "plasmo-shrink-0 plasmo-rounded-full plasmo-bg-neutral-900 plasmo-px-2 plasmo-py-0.5 plasmo-text-[10px] plasmo-font-medium plasmo-text-white"

export const smallButtonClass =
  "plasmo-inline-flex plasmo-shrink-0 plasmo-items-center plasmo-gap-1 plasmo-rounded plasmo-border plasmo-border-neutral-300 plasmo-bg-white plasmo-px-2 plasmo-py-1 plasmo-text-xs plasmo-font-medium plasmo-text-neutral-900 hover:plasmo-border-neutral-900 disabled:plasmo-opacity-40"

export const dangerButtonClass =
  "hover:plasmo-border-red-500 hover:plasmo-text-red-600"

export const hintClass =
  "plasmo-text-xs plasmo-leading-relaxed plasmo-text-neutral-500"

/** Every tab opens the same way: a title on the left, an action or count right. */
export function SectionHeader({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="plasmo-flex plasmo-items-center plasmo-justify-between plasmo-gap-2">
      <h2 className="plasmo-text-sm plasmo-font-semibold">{title}</h2>
      {children}
    </div>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="plasmo-block plasmo-space-y-1">
      <span className="plasmo-text-xs plasmo-font-medium plasmo-text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="plasmo-text-xs plasmo-text-red-600" role="alert">
      {children}
    </p>
  )
}

export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

/**
 * Four decimals is all a 400px popup has room for, while `formatEther` hands
 * back full wei precision. Anything unparseable renders as zero rather than
 * `NaN`, which is what a bare `parseFloat(...).toFixed(4)` would show.
 */
export const formatBalance = (value: string, decimals = 4): string => {
  const parsed = Number(value)
  return (Number.isFinite(parsed) ? parsed : 0).toFixed(decimals)
}

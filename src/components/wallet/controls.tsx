/**
 * Shared popup controls. The popup is 400px wide and has four screens, so a few
 * class strings and two thin wrappers keep the markup readable without pulling
 * in a component library.
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

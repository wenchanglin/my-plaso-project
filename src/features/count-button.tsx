import React from "react"

export const CountButton = ({
  count,
  setCount,
  removeCount
}: {
  count: number
  setCount: (count: number) => void
  removeCount: () => void
}) => {
  return (
    <button
      onClick={() => setCount(count + 1)}
      type="button"
      className="plasmo-flex plasmo-flex-row plasmo-items-center plasmo-px-4 plasmo-py-2 plasmo-text-sm plasmo-rounded-lg plasmo-transition-all plasmo-border-none
      plasmo-shadow-lg hover:plasmo-shadow-md
      active:plasmo-scale-105 plasmo-bg-slate-50 hover:plasmo-bg-slate-100 plasmo-text-slate-800 hover:plasmo-text-slate-900">
      Count:
      <span className="plasmo-inline-flex plasmo-items-center plasmo-justify-center plasmo-w-8 plasmo-h-4 plasmo-ml-2 plasmo-text-xs plasmo-font-semibold plasmo-rounded-full">
        {count}
      </span>
      <span className="plasmo-ml-1" onClick={removeCount}>
        remove
      </span>
    </button>
  )
}

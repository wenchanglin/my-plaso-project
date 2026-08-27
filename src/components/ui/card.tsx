/**
 * Card shell used by the setup tabs. Plain elements: the popup only needs the
 * border, padding and heading rhythm, not a component library.
 */
import React from "react"

const join = (...classes: (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")

export function Card({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={join(
        "plasmo-rounded plasmo-border plasmo-border-neutral-200 plasmo-bg-white",
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={join("plasmo-space-y-1 plasmo-p-3 plasmo-pb-0", className)}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={join(
        "plasmo-flex plasmo-items-center plasmo-gap-2 plasmo-text-sm plasmo-font-semibold",
        className
      )}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={join(
        "plasmo-text-xs plasmo-text-neutral-500",
        className
      )}
      {...props}
    />
  )
}

export function CardContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={join("plasmo-space-y-3 plasmo-p-3", className)}
      {...props}
    />
  )
}

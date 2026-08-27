/**
 * Thin wrappers over Radix Tabs that carry the popup's class strings, so the
 * screens below stay free of styling noise.
 */
import * as TabsPrimitive from "@radix-ui/react-tabs"
import React from "react"

const join = (...classes: (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={join(
      "plasmo-inline-flex plasmo-w-full plasmo-items-center plasmo-gap-1 plasmo-rounded plasmo-bg-neutral-100 plasmo-p-1",
      className
    )}
    {...props}
  />
))
TabsList.displayName = "TabsList"

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={join(
      "plasmo-flex-1 plasmo-whitespace-nowrap plasmo-rounded plasmo-px-2 plasmo-py-1.5 plasmo-text-xs plasmo-font-medium plasmo-text-neutral-500 plasmo-transition-colors disabled:plasmo-opacity-40 data-[state=active]:plasmo-bg-white data-[state=active]:plasmo-text-neutral-900 data-[state=active]:plasmo-shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = "TabsTrigger"

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={join("plasmo-mt-3 plasmo-outline-none", className)}
    {...props}
  />
))
TabsContent.displayName = "TabsContent"

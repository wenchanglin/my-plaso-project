import "~style.css"

import { TooltipProvider } from "@radix-ui/react-tooltip"

import { Toaster as Sonner } from "./components/ui/sonner"
import { Toaster } from "./components/ui/toaster"
import { PageIndex } from "./pages/Index"

function PopupShell() {
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PageIndex />
    </TooltipProvider>
  )
}

export default PopupShell

import "~style.css"

import { TooltipProvider } from "@radix-ui/react-tooltip"

import { Toaster } from "./components/ui/sonner"
import { PageIndex } from "./pages/Index"

function PopupShell() {
  return (
    <TooltipProvider>
      <Toaster />
      <PageIndex />
    </TooltipProvider>
  )
}

export default PopupShell

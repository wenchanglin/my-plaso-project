import type { PlasmoCSConfig } from "plasmo"

import injectMyWallet from "../background/injected-helper.ts"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*"],
  world: "MAIN",
  run_at: "document_start"
}

injectMyWallet()

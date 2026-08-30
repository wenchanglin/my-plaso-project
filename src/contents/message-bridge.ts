import type { PlasmoCSConfig } from "plasmo"

import { handleWalletMessage } from "../bridge/message-bridge.ts"

// Keep `matches` identical to injected-helper.ts — see the note there for why
// the list must be a literal and why every host also needs a host permission.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  run_at: "document_start"
}

// The page-facing helper cannot call chrome.runtime, so this isolated content
// script is its single runtime messaging gateway. No verbose event logging is
// used here; unrelated page messages should remain invisible to the console.
if (typeof window !== "undefined") {
  const port = chrome.runtime.connect({ name: "ethereum-events" })
  port.onMessage.addListener((message: unknown) => {
    if (message && typeof message === "object" &&
        (message as { from?: string }).from === "my-wallet-background") {
      window.postMessage(message, "*")
    }
  })

  window.addEventListener("message", (event) => {
    void handleWalletMessage(
      event,
      (message, callback) => chrome.runtime.sendMessage(message, callback),
      (message, targetOrigin = "*") => window.postMessage(message, targetOrigin),
      window
    )
  })
}

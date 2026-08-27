import type { PlasmoCSConfig } from "plasmo"

import { handleWalletMessage } from "../bridge/message-bridge.ts"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*"],
  run_at: "document_start"
}

// The page-facing helper cannot call chrome.runtime, so this isolated content
// script is its single runtime messaging gateway. No verbose event logging is
// used here; unrelated page messages should remain invisible to the console.
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    void handleWalletMessage(
      event,
      (message, callback) => chrome.runtime.sendMessage(message, callback),
      (message, targetOrigin = "*") => window.postMessage(message, targetOrigin),
      window
    )
  })
}

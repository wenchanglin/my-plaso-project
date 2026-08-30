import type { PlasmoCSConfig } from "plasmo"

import injectMyWallet from "../background/injected-helper.ts"

// `matches` must stay identical to message-bridge.ts: this MAIN-world script
// owns `window.ethereum` but cannot reach chrome.runtime, so a page that gets
// the provider without the bridge would hang on every request.
//
// Keep the array a literal. Plasmo reads this config by walking the AST, and it
// only resolves identifiers declared in this same file — an imported constant
// silently becomes `matches: ["<all_urls>"]`, and a spread element is dropped.
//
// Plasmo also strips MAIN-world scripts out of the manifest and registers them
// through chrome.scripting.registerContentScripts instead, which requires a
// matching host permission. Any host added here needs the same entry under
// `manifest.host_permissions` in package.json, or registration throws — and
// Plasmo swallows that rejection, so the provider just never appears.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
  world: "MAIN",
  run_at: "document_start"
}

injectMyWallet()

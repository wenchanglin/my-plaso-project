# Wallet bridge migration design

## Scope

This migration extracts only the reference extension's page-to-extension communication
infrastructure. Wallet business logic is intentionally out of scope: no wallet creation,
import, unlock, account management, network, balance, token, transaction, ethers, bip39,
crypto-js, Zustand, or wallet UI code is copied.

## Architecture

The communication path is:

```text
page -> injected-helper (MAIN world)
      -> window.postMessage
      -> message-bridge (isolated content script)
      -> chrome.runtime.sendMessage
      -> background handler
      -> message-bridge -> page
```

`injected-helper` exposes `window.myWallet` with `connect`, `getAccount`, `signMessage`,
and `disconnect`. It cannot access `chrome.runtime`, so it only posts structured messages.
The bridge validates and forwards those messages. The background handler owns extension
APIs and returns serializable responses.

Plasmo's declarative content-script configuration is used for the bridge and MAIN-world
injection. Plasmo 0.90.5 implements MAIN-world scripts with
`chrome.scripting.registerContentScripts`, so the generated manifest includes the
`scripting` permission. The reference project's `tabs.onUpdated` plus repeated
`scripting.executeScript` injection loop and its `tabs` permission are not copied.

## Protocol

Requests use:

```ts
{
  from: "my-wallet-injected",
  type: "WALLET_CONNECT" | "WALLET_GET_ACCOUNT" |
    "WALLET_SIGN_MESSAGE" | "WALLET_DISCONNECT",
  requestId: string,
  data?: unknown
}
```

Responses use:

```ts
{
  from: "my-wallet-bridge",
  requestId: string,
  success: boolean,
  data?: unknown,
  error?: string
}
```

The bridge checks `event.source === window`, the exact `from` marker, a known message
type, and a non-empty request ID before forwarding. Responses are matched by request ID.
Each page-side request removes its listener and timeout on every terminal path.

## Background behavior

`WALLET_CONNECT` reuses the current `getData` authorization flow and opens the popup. The
popup's Agree/Reject actions update the pending request with an explicit result. The other
wallet methods return structured "wallet business not connected" errors for now, except
`disconnect`, which returns success. This keeps the transport usable without pretending
that wallet operations have been migrated.

Asynchronous `chrome.runtime.onMessage` handlers return `true` so their later
`sendResponse` calls remain valid. Errors are converted to strings before crossing an
extension or page boundary.

## Logging and security

The bridge does not log every `window.postMessage` event. Diagnostic logs, if needed, are
emitted only after validation and include the message type/request ID rather than the full
event object. This avoids the reference project's misleading repeated
"收到来自 injected-helper 的消息" output for unrelated page messages.

No private key, mnemonic, wallet address, RPC endpoint, or hard-coded secret is introduced
by this migration.

## Verification

Verification covers:

1. Protocol unit tests for validation, request IDs, timeout cleanup, and response matching.
2. TypeScript/Plasmo production build and generated-manifest inspection.
3. Static checks confirming no wallet-business dependencies or secret material were copied.
4. Browser smoke testing with the current build: the injected API is present, connect reaches
   the authorization popup, unsupported wallet operations fail clearly, and normal bridge
   traffic is not repeatedly logged.

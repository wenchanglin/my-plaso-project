# Wallet Bridge Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the reference extension's page-to-background communication bridge into the current Plasmo project without migrating wallet business logic.

**Architecture:** A typed MAIN-world injected helper exposes `window.myWallet`; an isolated content script validates `window.postMessage` requests and forwards them with `chrome.runtime.sendMessage`; the background message router returns serializable responses and reuses the existing `getData` authorization request for `connect`. The current popup remains the authorization UI and reports Agree/Reject explicitly.

**Tech Stack:** Plasmo 0.90.5, React 18, TypeScript 5.3, Chrome MV3 APIs, Node built-in test runner.

## Global Constraints

- Wallet creation, import, unlock, account, network, balance, token, transaction, ethers, bip39, crypto-js, Zustand, and wallet UI code remain out of scope.
- No private key, mnemonic, wallet address, RPC endpoint, or hard-coded secret is introduced.
- Bridge validation must check `event.source === window`, exact source marker, known message type, and non-empty request ID.
- Every page-side request must clear its response listener and timeout on success, failure, or timeout.
- Asynchronous Chrome message handlers must return `true`.
- Complex cross-world and async cleanup logic must include succinct explanatory comments.

### Task 1: Add protocol types and pure validation helpers

**Files:**
- Create: `src/bridge/protocol.ts`
- Create: `tests/protocol.test.mjs`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces `WALLET_MESSAGE_TYPES`, `WalletMessageType`, `WalletRequest`, `WalletResponse`, `isWalletMessageType`, `isWalletRequest`, and `createRequestId` for the bridge and injected helper.

- [ ] **Step 1: Write the failing test** for known/unknown message validation and request ID shape in `tests/protocol.test.mjs`.
- [ ] **Step 2: Run `node --test tests/protocol.test.mjs` and confirm it fails because the protocol module is absent.**
- [ ] **Step 3: Implement the minimal typed constants, guards, response shape, and request ID generator in `src/bridge/protocol.ts`.**
- [ ] **Step 4: Run `node --test --experimental-strip-types tests/protocol.test.mjs` and confirm it passes.**

### Task 2: Implement the MAIN-world injected API

**Files:**
- Create: `src/background/injected-helper.ts`
- Create: `src/background/injected-helper.test.mjs`
- Modify: `src/types/window.d.ts`

**Interfaces:**
- Produces `injectMyWallet(): void`, which defines `window.myWallet.connect()`, `getAccount()`, `signMessage(message)`, and `disconnect()`.

- [ ] **Step 1: Write a failing test** covering one request/response round trip and timeout cleanup using a mocked `window` event target.
- [ ] **Step 2: Run the focused test and confirm it fails because `injectMyWallet` is absent.**
- [ ] **Step 3: Implement the helper with one request listener and timeout per call; add comments explaining MAIN-world isolation, request correlation, and cleanup.**
- [ ] **Step 4: Run the focused test and confirm success, including a rejected timeout case.**

### Task 3: Implement the isolated content-script bridge

**Files:**
- Create: `src/contents/message-bridge.ts`
- Create: `src/contents/message-bridge.test.mjs`

**Interfaces:**
- Produces `handleWalletMessage(event, runtimeSendMessage, postMessage)` for testable validation/forwarding and registers it once at module load for the real content script.

- [ ] **Step 1: Write failing tests** for ignored unrelated messages, forwarded valid requests, and serialized runtime errors.
- [ ] **Step 2: Run the focused tests and confirm they fail because the bridge handler is absent.**
- [ ] **Step 3: Implement source/type/request-ID validation and response forwarding; add comments explaining why the bridge is required and why full events are not logged.**
- [ ] **Step 4: Run the focused tests and confirm all bridge cases pass.**

### Task 4: Wire background routing and authorization responses

**Files:**
- Create: `src/background/type_constant.ts`
- Create: `src/background/index.ts`
- Modify: `src/background/messages/getData.ts`
- Modify: `src/popup.tsx`

**Interfaces:**
- Background accepts the four protocol message types and returns `{ data: ... }` responses to the bridge. `WALLET_CONNECT` creates a pending authorization request and opens the popup; popup actions resolve it with `{ account: null, approved: boolean }` until wallet business is migrated.

- [ ] **Step 1: Add a failing protocol-router test** for unsupported wallet operations, disconnect success, and connect pending state.
- [ ] **Step 2: Run it and confirm the router behavior is not implemented.**
- [ ] **Step 3: Implement the background listener with explicit errors, `return true` for async handlers, and popup result persistence; replace the current random agree/reject writes with the pending request result.**
- [ ] **Step 4: Run focused tests and a TypeScript check.**

### Task 5: Configure declarative injection and verify the extension

**Files:**
- Inspect: generated `build/chrome-mv3-dev/manifest.json`
- Modify: `tsconfig.json` if needed for bridge aliases
- Modify: `README.md` with the migrated bridge contract

- [ ] **Step 1: Build the extension and inspect the generated manifest for the bridge content script, Plasmo's MAIN-world `scripting` registration, and absence of the reference project's `tabs` permission.**
- [ ] **Step 2: Run the full Node test suite and production Plasmo build.**
- [ ] **Step 3: Run static scans for wallet-business dependencies, secrets, and the old repeated bridge log string.**
- [ ] **Step 4: Review `git diff` and report any intentionally omitted reference files.**

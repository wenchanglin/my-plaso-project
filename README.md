This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm install --registry=https://registry.npmmirror.com
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Page bridge

The extension injects `window.myWallet` on HTTPS pages. It exposes the transport methods
`connect()`, `getAccount()`, `signMessage(message)`, and `disconnect()`.

`connect()` opens the extension popup and resolves with the current account only after the
user approves the request; an already-approved origin is served without a prompt.
`getAccount()` requires an approved origin. `signMessage(message)` requires an approved
origin *and* its own approval for every call, and resolves with `{ signature, address }`.
`disconnect()` removes the origin from the approved list.

The origin is read from Chrome's `MessageSender`, never from the page, so a page cannot
claim to be a different site.

The page API communicates through a validated content-script bridge. Normal page messages
are ignored silently, so the bridge does not repeatedly print unrelated
`window.postMessage` events.

### Approval timeouts

A pending approval waits five minutes (`DEFAULT_AUTHORIZATION_TIMEOUT_MS` in
`src/background/authorization.ts`), and the page-side ceiling for the methods that can prompt
sits above it at 5.5 minutes (`INTERACTIVE_TIMEOUT_MS`). The order is the point. With the page
giving up first — 30 seconds, as it was — a confirmation clicked at second 45 still reached
`wallet.sendTransaction`: the swap went on-chain while the dapp had already reported
`4900 Wallet request timed out`. Reads keep the 30-second ceiling, where a timeout can only mean
a dead bridge.

MV3 evicts an idle service worker after 30 seconds, and waiting for a human is pure idle time, so
`waitForDecision` pings `chrome.runtime.getPlatformInfo` every 20 seconds to hold the worker open
until the user decides.

### Sharing `window.ethereum` with other wallets

`window.ethereum` is one global that every installed wallet assigns at `document_start`, so
whichever extension writes last wins — a legacy `window.ethereum.request(...)` reaches MetaMask,
not this wallet, whenever MetaMask writes second. `src/background/injected-helper.ts` handles
that in two ways:

- The provider is always built, so it always dispatches `eip6963:announceProvider`. Any
  EIP-6963-aware dapp (wagmi, RainbowKit, Web3Modal) lists **My Wallet** next to MetaMask and
  lets the user pick, no race involved.
- A development build additionally *holds* the legacy global: it installs `window.ethereum` as a
  non-configurable getter, so a wallet that injects later cannot take it back. The displaced
  provider stays reachable at `window.myWalletShadowed`. A production build never does this — it
  claims the global only while it is free and leaves it writable, exactly as MetaMask does.

So `await window.ethereum.request({ method: "eth_requestAccounts" })` opens this wallet when
`build/chrome-mv3-dev` is loaded. If another wallet defined the global non-configurably before
this script ran, it cannot be replaced at all; the console says so, and EIP-6963 (or disabling
that wallet) is the way in.

Note what the legacy global cannot do: pick. `window.ethereum.request(...)` reaches exactly one
provider, whichever owns the global — no standard turns it into a chooser. Listing every
installed wallet is the *page's* job, and it is what wagmi / RainbowKit / Web3Modal do with the
EIP-6963 announcements.

## Test dapp

`test-dapp/index.html` is that page, in about a hundred lines of dependency-free JavaScript: it
collects `eip6963:announceProvider`, lists every wallet that answered with its `rdns`, and lets
one be selected and then driven through `eth_requestAccounts`, `personal_sign`,
`eth_signTypedData_v4`, a read-only `eth_getBalance`, `wallet_switchEthereumChain`,
`eth_sendTransaction` and a `wallet_watchAsset` that is expected to be refused with `4200`. It
also reports who owns `window.ethereum` and whether anything is parked in
`window.myWalletShadowed`.

```bash
node test-dapp/serve.mjs 8080
```

Then open `http://localhost:8080`. It has to be served, not opened as a `file://` URL: the
content scripts match `https://*/*`, `http://localhost/*` and `http://127.0.0.1/*`, so a local
file gets no injected provider. The server is loopback-only and serves that one directory.

## Wallet state

`src/stores/walletStore.ts` is a zustand store persisted to `chrome.storage.local`, shared by
the popup and the service worker. Because the MV3 worker is evicted between requests, the
background code calls `hydrateWalletStore()` before every request instead of trusting its
in-memory copy.

Key handling:

- The password is never stored. Unlocking derives a key with PBKDF2-SHA256 (250k iterations,
  per-vault salt) and keeps it in `chrome.storage.session`, which is memory-only and
  unreachable from content scripts.
- Only ciphertext reaches disk. The recovery phrase and every private key are encrypted with
  AES-GCM; plaintext keys exist only for the duration of a signing or approved transaction call.
- The wallet starts locked, and `lock()` drops the session key.
- Approvals are recorded per origin (`connections`), not as one global flag.

Crypto comes from the platform (`crypto.subtle`) and `ethers`; there is no `crypto-js` or
`bip39` dependency and no Buffer polyfill. `DEFAULT_NETWORKS` uses keyless public RPC
endpoints, so no API key is committed.

Tokens are tracked manually, by contract address, and filed per chain. `src/lib/token.ts` probes
ERC-165 to tell ERC-20, ERC-721 and ERC-1155 apart and reads whatever metadata the standard
actually exposes; balances come from `src/hooks/use-token-balances.ts`, one provider and one
`eth_call` per token, and never reach disk. Sending is ERC-20 only — 721/1155 `safeTransferFrom`
is not implemented. `wallet_watchAsset` still returns `4200`, so a dapp cannot add a token; and
because an NFT's `tokenId`s cannot be enumerated without an indexing service, an ERC-721
collection shows a holding count unless a `tokenId` is given. ERC-1155 has no on-chain name or
symbol, so those are typed in by hand. A contract's self-reported `symbol()` is forgeable, so
every screen shows the contract address beside it.

The dashboard reads the native balance over JSON-RPC (`src/hooks/use-native-balance.ts`), and
dapps can use the injected `window.ethereum` provider for account access, signatures,
typed-data signatures, network changes, read-only RPC, and approved `eth_sendTransaction`
broadcasts. `importPrivateKey` needs an unlocked wallet, and `createWallet` / `importMnemonic`
refuse to overwrite an existing vault.

## Popup screens

`src/pages/Index.tsx` picks one screen at a time, in this order: the setup tabs when there is
no vault, the unlock prompt when the vault is locked, the one-time recovery-phrase backup, a
pending dapp authorization, and otherwise `WalletDashboard`.

`WalletDashboard` is the screen behind an unlocked wallet, split into six tabs: 总览 (account
card, native balance, block-explorer link), 转账 (native-coin transfer with recipient and amount
validation), 代币 (tracked tokens with balances, an add-by-address form with standard detection,
and the ERC-20 send screen), 账户 (switch, derive, import a private key, export secrets, reset the
wallet), 网络 (switch between `DEFAULT_NETWORKS`), and 连接 (approved origins, with a per-origin
disconnect).

## Tests

```bash
npm test
```

Runs the Node test runner against `tests/`. Chrome APIs are stubbed by
`tests/chrome-stub.mjs`; the crypto, keyring, store, and background modules are exercised
directly.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!

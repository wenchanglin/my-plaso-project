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
  AES-GCM; plaintext keys exist only inside `signMessageFor()`.
- The wallet starts locked, and `lock()` drops the session key.
- Approvals are recorded per origin (`connections`), not as one global flag.

Crypto comes from the platform (`crypto.subtle`) and `ethers`; there is no `crypto-js` or
`bip39` dependency and no Buffer polyfill. `DEFAULT_NETWORKS` uses keyless public RPC
endpoints, so no API key is committed.

Not implemented: token balances and transaction sending. `importPrivateKey` needs an unlocked
wallet, and `createWallet` / `importMnemonic` refuse to overwrite an existing vault.

## Tests

```bash
npm test
```

Runs the Node test runner against `tests/`. Chrome APIs are stubbed by
`tests/chrome-stub.mjs`; the crypto, keyring, store, and background modules are exercised
directly.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!

import { createInjectedWallet } from "../bridge/injected-api.ts"
import { createDappProvider, type EthereumProvider } from "../services/dappProvider.ts"

/**
 * What this script may touch on the page's `window`. Passed in rather than read
 * from the global so the injection rules are testable in Node.
 */
export interface PageWindow {
  /** Whatever wallet owns the legacy global — possibly not this one. */
  ethereum?: unknown
  myWallet?: ReturnType<typeof createInjectedWallet>
  /** Set once per page, so a re-run does not announce a second provider. */
  myWalletProvider?: EthereumProvider
  /** The provider that was displaced, kept for debugging rather than dropped. */
  myWalletShadowed?: unknown
  addEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  removeEventListener: (type: string, listener: (event: MessageEvent) => void) => void
  postMessage: (message: unknown, targetOrigin?: string) => void
  dispatchEvent?: (event: Event) => boolean
}

/**
 * Taking the global away from an installed wallet hides it on every page this
 * script runs on, which is fine while developing against a dapp and hostile in
 * a published build. Plasmo inlines this at build time.
 */
const DEV_BUILD = process.env.NODE_ENV !== "production"

/**
 * Claims `window.ethereum` and keeps it, which a plain assignment cannot do:
 * MetaMask's `setGlobalProvider` assigns the same global at `document_start`,
 * so the loser of that race is whoever wrote first.
 *
 * Returns false when the property is already non-configurable — the incumbent
 * locked it, and nothing but EIP-6963 gets in after that.
 */
const holdGlobal = (page: PageWindow, provider: EthereumProvider): boolean => {
  const incumbent = page.ethereum

  try {
    Object.defineProperty(page, "ethereum", {
      configurable: false,
      enumerable: true,
      get: () => provider,
      // Accept and park a later write instead of refusing it: a getter-only
      // property makes `window.ethereum = …` throw, and that assignment sits
      // inside another extension's initialization.
      set: (value: unknown) => {
        page.myWalletShadowed = value
      }
    })
  } catch (cause) {
    console.warn(
      "[My Wallet] another wallet locked window.ethereum. Use EIP-6963 discovery, or disable that wallet to test the legacy global.",
      cause
    )
    return false
  }

  if (incumbent) page.myWalletShadowed = incumbent
  return true
}

/**
 * MAIN-world entry point. It is intentionally tiny: the page gets a typed
 * request API, while all extension privileges stay inside the bridge/background
 * worlds. The guard makes repeated content-script execution harmless.
 */
export const injectMyWallet = (
  page: PageWindow = window as unknown as PageWindow,
  /**
   * Hold `window.ethereum` even against a wallet that already owns it. On by
   * default in a development build, where this extension is the wallet under
   * test.
   */
  { takeOver = DEV_BUILD }: { takeOver?: boolean } = {}
): void => {
  if (!page.myWallet) page.myWallet = createInjectedWallet(page)

  if (page.myWalletProvider) return

  // Built unconditionally, even when the global is someone else's: creating the
  // provider is what announces it over EIP-6963, which is how a modern dapp
  // offers a choice between installed wallets instead of picking the winner of
  // an injection race.
  const provider = createDappProvider(page)
  page.myWalletProvider = provider

  let owned = false
  if (takeOver) {
    owned = holdGlobal(page, provider)
  } else if (!page.ethereum) {
    // Polite build: claim the global only while it is free, and leave it
    // writable, exactly as MetaMask's own `setGlobalProvider` does.
    page.ethereum = provider
    owned = true
  } else {
    console.info(
      "[My Wallet] window.ethereum belongs to another wallet; this wallet stays reachable over EIP-6963."
    )
  }

  // Dapps that ran before the provider existed wait on MetaMask's long-standing
  // readiness signal.
  if (owned && typeof page.dispatchEvent === "function") {
    page.dispatchEvent(new Event("ethereum#initialized"))
  }
}

export default injectMyWallet

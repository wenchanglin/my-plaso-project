import { createInjectedWallet } from "../bridge/injected-api.ts"
import { createDappProvider } from "../services/dappProvider.ts"

/**
 * MAIN-world entry point. It is intentionally tiny: the page gets a typed
 * request API, while all extension privileges stay inside the bridge/background
 * worlds. The guard makes repeated content-script execution harmless.
 */
export const injectMyWallet = (): void => {
  const page = window as Window & {
    myWallet?: ReturnType<typeof createInjectedWallet>
    ethereum?: ReturnType<typeof createDappProvider>
  }

  if (!page.myWallet) page.myWallet = createInjectedWallet(window)
  if (!page.ethereum) page.ethereum = createDappProvider(window)
}

export default injectMyWallet

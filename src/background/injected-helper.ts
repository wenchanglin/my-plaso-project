import { createInjectedWallet } from "../bridge/injected-api.ts"

/**
 * MAIN-world entry point. It is intentionally tiny: the page gets a typed
 * request API, while all extension privileges stay inside the bridge/background
 * worlds. The guard makes repeated content-script execution harmless.
 */
export const injectMyWallet = (): void => {
  const page = window as Window & {
    myWallet?: ReturnType<typeof createInjectedWallet>
  }

  if (page.myWallet) return
  page.myWallet = createInjectedWallet(window)
}

export default injectMyWallet

import type { InjectedWalletApi } from "../bridge/injected-api.ts"

declare global {
  interface Window {
    myWallet?: InjectedWalletApi
  }
}

export {}

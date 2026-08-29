import type { InjectedWalletApi } from "../bridge/injected-api.ts"
import type { EthereumProvider } from "../services/dappProvider.ts"

declare global {
  interface Window {
    myWallet?: InjectedWalletApi
    ethereum?: EthereumProvider
  }
}

export {}

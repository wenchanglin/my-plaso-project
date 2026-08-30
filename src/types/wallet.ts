/**
 * Wallet domain types.
 *
 * `WalletAccount` deliberately carries no private key: it is the only account
 * shape that reaches React state, persisted storage, or the page bridge. Key
 * material lives in `StoredAccount.encryptedPrivateKey` and is decrypted only
 * for the duration of a signing call.
 */
export interface WalletAccount {
  address: string
  name: string
  /** BIP-44 index on the recovery phrase, or -1 for an imported private key. */
  index: number
}

export interface StoredAccount extends WalletAccount {
  encryptedPrivateKey: string
}

export interface Network {
  id: string
  name: string
  rpcUrl: string
  chainId: number
  symbol: string
  blockExplorerUrl?: string
}

export type TokenStandard = "ERC20" | "ERC721" | "ERC1155"

/**
 * A token the user chose to track.
 *
 * Persisted, so every field has to survive `chrome.storage.local`: the store's
 * storage adapter is a `PersistStorage` rather than a JSON one, so there is no
 * replacer hook where a `bigint` could be encoded. Amounts stay decimal strings
 * and are only widened to `bigint` inside a single call.
 */
export interface TrackedToken {
  /** `${chainId}:${lowercased address}:${tokenId ?? ""}`, built by `tokenKey`. */
  key: string
  /**
   * Scoping. `Network.id` is synthesized as `chain-${chainId}` for chains a dapp
   * adds through `wallet_addEthereumChain`, so `chainId` is the only stable
   * identity a token record can key on.
   */
  chainId: number
  standard: TokenStandard
  /** Checksummed for display. Identity uses the lowercase form, via `key`. */
  address: string
  symbol: string
  name: string
  /** Always 0 for ERC-721 and ERC-1155: those are counted in whole units. */
  decimals: number
  /** Required for ERC-1155, optional for ERC-721, absent for ERC-20. */
  tokenId?: string
}

/**
 * Keyless public endpoints so no API key is committed to the repository.
 * Replace `rpcUrl` with your own provider when you need higher rate limits.
 */
export const DEFAULT_NETWORKS: Network[] = [
  {
    id: "sepolia",
    name: "Ethereum Sepolia Testnet",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    symbol: "ETH",
    blockExplorerUrl: "https://sepolia.etherscan.io"
  },
  {
    id: "ethereum",
    name: "Ethereum Mainnet",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    chainId: 1,
    symbol: "ETH",
    blockExplorerUrl: "https://etherscan.io"
  },
  {
    id: "polygon",
    name: "Polygon Mainnet",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    chainId: 137,
    symbol: "POL",
    blockExplorerUrl: "https://polygonscan.com"
  }
]

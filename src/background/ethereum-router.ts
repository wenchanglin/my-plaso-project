import { getBytes, isAddress } from "ethers"

import { isEthereumRequest, type EthereumRequest } from "../bridge/protocol.ts"
import type { AuthorizationDecision } from "../lib/authorization.ts"
import type { Network, WalletAccount } from "../types/wallet.ts"

export interface EthereumRequestContext {
  origin: string
}

export type EthereumEventName =
  | "accountsChanged"
  | "chainChanged"
  | "connect"
  | "disconnect"

export interface EthereumWalletGateway {
  getCurrentAccount: () => Promise<WalletAccount | null>
  isUnlocked: () => Promise<boolean>
  isConnected: (origin: string) => Promise<boolean>
  connect: (origin: string) => Promise<void>
  disconnect: (origin: string) => Promise<void>
  getCurrentNetwork: () => Promise<Network | null>
  findNetworkByChainId: (chainId: number) => Promise<Network | null>
  addNetwork: (network: Network) => Promise<void>
  switchNetwork: (networkId: string) => Promise<void>
  signMessage: (address: string, message: string | Uint8Array) => Promise<string>
  signTypedData?: (
    address: string,
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ) => Promise<string>
  sendTransaction?: (
    address: string,
    transaction: Record<string, unknown>,
    network: Network
  ) => Promise<string>
}

export interface EthereumRequestHandlerOptions {
  wallet: EthereumWalletGateway
  requestAuthorization: (
    request: EthereumRequest,
    context: { origin: string; message?: string }
  ) => Promise<AuthorizationDecision>
  rpcRequest: (network: Network, method: string, params: unknown[]) => Promise<unknown>
  onEvent?: (origin: string, event: EthereumEventName, data?: unknown) => Promise<void> | void
}

export interface ProviderError extends Error {
  code: number
  data?: unknown
}

const error = (code: number, message: string, data?: unknown): ProviderError => {
  const result = Object.assign(new Error(message), { code }) as ProviderError
  if (data !== undefined) result.data = data
  return result
}

const requireOrigin = (context: EthereumRequestContext): void => {
  if (!context.origin) throw error(4100, "Unknown request origin")
}

const readParams = (request: EthereumRequest): unknown[] =>
  Array.isArray(request.data.params) ? request.data.params : []

const readChainId = (value: unknown): number => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw error(-32602, "Invalid chain ID")
  }
  const chainId = Number.parseInt(value, 16)
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw error(-32602, "Invalid chain ID")
  return chainId
}

const chainHex = (chainId: number): string => `0x${chainId.toString(16)}`

const addressAt = (value: unknown): string => {
  if (typeof value !== "string" || !isAddress(value)) throw error(-32602, "Invalid address")
  return value
}

const parseTypedData = (value: unknown) => {
  let parsed: unknown = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw error(-32602, "Invalid typed data JSON")
    }
  }
  if (!parsed || typeof parsed !== "object") throw error(-32602, "Invalid typed data")
  const input = parsed as {
    domain?: unknown
    types?: unknown
    message?: unknown
    primaryType?: unknown
  }
  if (!input.types || typeof input.types !== "object" || !input.message || typeof input.message !== "object") {
    throw error(-32602, "Invalid typed data")
  }
  const types = { ...(input.types as Record<string, Array<{ name: string; type: string }>>) }
  delete types.EIP712Domain
  return {
    domain: (input.domain ?? {}) as Record<string, unknown>,
    types,
    value: input.message as Record<string, unknown>
  }
}

const readableMessage = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value)

const decodePersonalMessage = (value: unknown): string | Uint8Array => {
  if (typeof value !== "string") throw error(-32602, "Invalid message")
  if (/^0x(?:[0-9a-f]{2})*$/i.test(value)) return getBytes(value)
  return value
}

const isHexQuantity = (value: unknown): boolean =>
  value === undefined || (typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))

const validateTransaction = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw error(-32602, "Invalid transaction")
  }
  const transaction = { ...(value as Record<string, unknown>) }
  if (transaction.from !== undefined) addressAt(transaction.from)
  if (transaction.to !== undefined && transaction.to !== null) addressAt(transaction.to)
  for (const field of ["value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "nonce"]) {
    if (!isHexQuantity(transaction[field])) throw error(-32602, `Invalid transaction ${field}`)
  }
  if (transaction.data !== undefined &&
      (typeof transaction.data !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(transaction.data))) {
    throw error(-32602, "Invalid transaction data")
  }
  return transaction
}

const requestAccount = async (
  request: EthereumRequest,
  context: EthereumRequestContext,
  options: EthereumRequestHandlerOptions
): Promise<string[]> => {
  const account = await options.wallet.getCurrentAccount()
  if (!account) throw error(4100, "No wallet account available")
  if (!(await options.wallet.isUnlocked())) throw error(4100, "Wallet is locked")
  if (await options.wallet.isConnected(context.origin)) return [account.address]

  const decision = await options.requestAuthorization(request, { origin: context.origin })
  if (!decision.approved) throw error(4001, "User rejected the request")
  await options.wallet.connect(context.origin)
  await options.onEvent?.(context.origin, "accountsChanged", [account.address])
  await options.onEvent?.(context.origin, "connect", { chainId: chainHex((await options.wallet.getCurrentNetwork())?.chainId ?? 0) })
  return [account.address]
}

export const createEthereumRequestHandler = (options: EthereumRequestHandlerOptions) =>
  async (value: unknown, context: EthereumRequestContext): Promise<unknown> => {
    if (!isEthereumRequest(value)) throw error(-32600, "Invalid Ethereum request")
    requireOrigin(context)

    const request = value
    const method = request.data.method
    const params = readParams(request)
    const network = await options.wallet.getCurrentNetwork()

    switch (method) {
      case "eth_accounts": {
        if (!network || !(await options.wallet.isConnected(context.origin)) || !(await options.wallet.isUnlocked())) return []
        const account = await options.wallet.getCurrentAccount()
        return account ? [account.address] : []
      }
      case "eth_requestAccounts":
        return requestAccount(request, context, options)
      case "eth_chainId":
        if (!network) throw error(4900, "No network is configured")
        return chainHex(network.chainId)
      case "eth_coinbase": {
        if (!(await options.wallet.isConnected(context.origin)) || !(await options.wallet.isUnlocked())) return null
        return (await options.wallet.getCurrentAccount())?.address ?? null
      }
      case "net_version":
        if (!network) throw error(4900, "No network is configured")
        return String(network.chainId)
      case "wallet_isUnlocked":
        return options.wallet.isUnlocked()
      case "wallet_getPermissions":
        return (await options.wallet.isConnected(context.origin))
          ? [{ parentCapability: "eth_accounts" }]
          : []
      case "wallet_requestPermissions":
        await requestAccount(request, context, options)
        return [{ parentCapability: "eth_accounts" }]
      case "personal_sign": {
        const [first, second] = params
        const firstIsAddress = isAddress(String(first))
        const secondIsAddress = isAddress(String(second))
        if (!firstIsAddress && !secondIsAddress) throw error(-32602, "Invalid address")
        const address = secondIsAddress ? addressAt(second) : addressAt(first)
        const messageValue = secondIsAddress ? first : second
        return signMessage(request, context, options, address, decodePersonalMessage(messageValue), readableMessage(messageValue))
      }
      case "eth_sign": {
        const address = addressAt(params[0])
        const message = decodePersonalMessage(params[1])
        return signMessage(request, context, options, address, message, readableMessage(params[1]))
      }
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        const address = addressAt(params[0])
        const typed = parseTypedData(params[1])
        if (!options.wallet.signTypedData) throw error(4200, "Typed data signing is not supported")
        await requireConnected(address, context, options)
        const decision = await options.requestAuthorization(request, {
          origin: context.origin,
          message: readableMessage(params[1])
        })
        if (!decision.approved) throw error(4001, "User rejected the signature request")
        return options.wallet.signTypedData(address, typed.domain, typed.types, typed.value)
      }
      case "eth_sendTransaction": {
        if (!options.wallet.sendTransaction) throw error(4200, "Transaction sending is not supported")
        const transaction = validateTransaction(params[0])
        const from = addressAt(transaction.from)
        await requireConnected(from, context, options)
        if (!network) throw error(4900, "No network is configured")
        if (transaction.chainId !== undefined && readChainId(transaction.chainId) !== network.chainId) {
          throw error(4901, "Wallet is not connected to the requested chain")
        }
        const decision = await options.requestAuthorization(request, {
          origin: context.origin,
          message: JSON.stringify({ from, to: transaction.to, value: transaction.value, data: transaction.data })
        })
        if (!decision.approved) throw error(4001, "User rejected the transaction")
        return options.wallet.sendTransaction(from, transaction, network)
      }
      case "wallet_switchEthereumChain": {
        const chainId = readChainId((params[0] as { chainId?: unknown } | undefined)?.chainId)
        if (!network) throw error(4900, "No network is configured")
        if (chainId === network.chainId) return null
        const target = await options.wallet.findNetworkByChainId(chainId)
        if (!target) throw error(4902, "Unrecognized chain")
        const decision = await options.requestAuthorization(request, { origin: context.origin })
        if (!decision.approved) throw error(4001, "User rejected the network switch")
        await options.wallet.switchNetwork(target.id)
        await options.onEvent?.(context.origin, "chainChanged", chainHex(chainId))
        return null
      }
      case "wallet_addEthereumChain": {
        const input = params[0]
        if (!input || typeof input !== "object") throw error(-32602, "Invalid chain parameters")
        const details = input as Record<string, unknown>
        const chainId = readChainId(details.chainId)
        const rpcUrls = details.rpcUrls
        const native = details.nativeCurrency
        if (!Array.isArray(rpcUrls) || rpcUrls.length === 0 || rpcUrls.some((url) => typeof url !== "string" || !/^https:\/\//i.test(url))) {
          throw error(-32602, "At least one HTTPS RPC URL is required")
        }
        if (!native || typeof native !== "object" || typeof (native as { name?: unknown }).name !== "string" || typeof (native as { symbol?: unknown }).symbol !== "string") {
          throw error(-32602, "Invalid native currency")
        }
        const existing = await options.wallet.findNetworkByChainId(chainId)
        const target: Network = existing ?? {
          id: `chain-${chainId}`,
          name: typeof details.chainName === "string" ? details.chainName : `Chain ${chainId}`,
          rpcUrl: rpcUrls[0] as string,
          chainId,
          symbol: (native as { symbol: string }).symbol,
          blockExplorerUrl: Array.isArray(details.blockExplorerUrls) ? details.blockExplorerUrls[0] as string | undefined : undefined
        }
        const decision = await options.requestAuthorization(request, { origin: context.origin })
        if (!decision.approved) throw error(4001, "User rejected the network request")
        if (!existing) await options.wallet.addNetwork(target)
        await options.wallet.switchNetwork(target.id)
        await options.onEvent?.(context.origin, "chainChanged", chainHex(chainId))
        return null
      }
      case "eth_signTransaction":
      case "eth_sendRawTransaction":
      case "eth_subscribe":
      case "eth_unsubscribe":
      case "wallet_watchAsset":
        throw error(4200, `${method} is not supported`)
      default:
        if (!network) throw error(4900, "No network is configured")
        if (/^(eth_|net_|web3_)/.test(method)) return options.rpcRequest(network, method, params)
        throw error(4200, `Method ${method} is not supported`)
    }
  }

const requireConnected = async (
  address: string,
  context: EthereumRequestContext,
  options: EthereumRequestHandlerOptions
): Promise<void> => {
  if (!(await options.wallet.isConnected(context.origin))) throw error(4100, "This site is not connected")
  const account = await options.wallet.getCurrentAccount()
  if (!account || account.address.toLowerCase() !== address.toLowerCase()) {
    throw error(4100, "The account is not authorized")
  }
  if (!(await options.wallet.isUnlocked())) throw error(4100, "Wallet is locked")
}

const signMessage = async (
  request: EthereumRequest,
  context: EthereumRequestContext,
  options: EthereumRequestHandlerOptions,
  address: string,
  message: string | Uint8Array,
  displayMessage: string
): Promise<string> => {
  await requireConnected(address, context, options)
  const decision = await options.requestAuthorization(request, {
    origin: context.origin,
    message: displayMessage
  })
  if (!decision.approved) throw error(4001, "User rejected the signature request")
  return options.wallet.signMessage(address, message)
}

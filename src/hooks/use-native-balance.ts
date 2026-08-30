/**
 * Native coin balance of the current account on the current network.
 *
 * Read-only by construction: it opens a one-shot JSON-RPC provider and never
 * touches the vault or the session key. Tracked tokens are read separately by
 * `use-token-balances.ts`, which needs one provider for a whole batch of
 * `eth_call`s rather than the single `getBalance` here.
 */
import { formatEther, JsonRpcProvider } from "ethers"
import { useCallback, useEffect, useState } from "react"

import {
  selectCurrentAccount,
  selectCurrentNetwork,
  useWalletStore
} from "../stores/walletStore.ts"

export interface NativeBalanceState {
  /** Full precision as returned by the node, or null before the first read. */
  balance: string | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

interface Snapshot extends Omit<NativeBalanceState, "refresh"> {
  /**
   * The `address:networkId` the value belongs to. Switching either one blanks
   * the number instead of showing another chain's balance while loading.
   */
  key: string
}

const idle: Snapshot = { key: "", balance: null, isLoading: false, error: null }

export const useNativeBalance = (): NativeBalanceState => {
  const account = useWalletStore(selectCurrentAccount)
  const network = useWalletStore(selectCurrentNetwork)

  const [snapshot, setSnapshot] = useState<Snapshot>(idle)
  const [attempt, setAttempt] = useState(0)

  const address = account?.address ?? null
  const refresh = useCallback(() => setAttempt((count) => count + 1), [])

  useEffect(() => {
    if (!address) {
      setSnapshot(idle)
      return
    }

    const key = `${address}:${network.id}`
    let active = true
    // `staticNetwork` skips the chain-id probe: the network is configured here,
    // not discovered, so one round trip is enough for a balance read.
    const provider = new JsonRpcProvider(network.rpcUrl, network.chainId, {
      staticNetwork: true
    })

    setSnapshot((previous) => ({
      key,
      balance: previous.key === key ? previous.balance : null,
      isLoading: true,
      error: null
    }))

    provider
      .getBalance(address)
      .then((wei) => {
        if (!active) return
        setSnapshot({
          key,
          balance: formatEther(wei),
          isLoading: false,
          error: null
        })
      })
      .catch((cause: unknown) => {
        if (!active) return
        setSnapshot({
          key,
          balance: null,
          isLoading: false,
          error: cause instanceof Error ? cause.message : "读取余额失败"
        })
      })

    // Aborts an in-flight request, so a fast network switch cannot resolve into
    // the state of the network the user just left.
    return () => {
      active = false
      provider.destroy()
    }
  }, [address, network.id, network.rpcUrl, network.chainId, attempt])

  return {
    balance: snapshot.balance,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    refresh
  }
}

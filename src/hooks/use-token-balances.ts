/**
 * Balances of the tracked tokens for the current account and network.
 *
 * Structured like `use-native-balance.ts` — one throwaway JSON-RPC provider, no
 * vault and no session key — with two differences the multi-token case forces:
 * one provider is shared by the whole batch, and the reads are settled
 * individually so a single dead contract cannot blank the list.
 */
import { JsonRpcProvider } from "ethers"
import { useCallback, useEffect, useState } from "react"

import { ethCallVia, readTokenBalance } from "../lib/token.ts"
import {
  selectCurrentAccount,
  selectCurrentNetwork,
  selectTokensForCurrentNetwork,
  useWalletStore
} from "../stores/walletStore.ts"

export interface TokenBalanceState {
  /** Display string, or null while loading and after a failed read. */
  value: string | null
  error: string | null
}

export interface TokenBalancesState {
  /** Indexed by `TrackedToken.key`. */
  balances: Record<string, TokenBalanceState>
  isLoading: boolean
  refresh: () => void
}

/** Shared so an empty result keeps the same reference across renders. */
const noBalances: Record<string, TokenBalanceState> = {}

interface Snapshot extends Omit<TokenBalancesState, "refresh"> {
  /**
   * The `address:chainId` the numbers belong to. Switching either one blanks them
   * rather than showing another account's holdings while the next batch loads;
   * adding or removing a token leaves the batch key alone, so the rows that were
   * already read keep their value.
   */
  key: string
}

const idle: Snapshot = { key: "", balances: noBalances, isLoading: false }

export const useTokenBalances = (): TokenBalancesState => {
  const account = useWalletStore(selectCurrentAccount)
  const network = useWalletStore(selectCurrentNetwork)
  // Safe as an effect dependency only because the store buckets tokens per
  // chain: this is a stored array, not a fresh one built by a `filter`.
  const tokens = useWalletStore(selectTokensForCurrentNetwork)

  const [snapshot, setSnapshot] = useState<Snapshot>(idle)
  const [attempt, setAttempt] = useState(0)

  const address = account?.address ?? null
  const refresh = useCallback(() => setAttempt((count) => count + 1), [])

  useEffect(() => {
    if (!address || tokens.length === 0) {
      setSnapshot(idle)
      return
    }

    const key = `${address}:${network.chainId}`
    let active = true
    // One provider for the whole batch. One per token would leave N pending
    // fetches behind on every re-render.
    const provider = new JsonRpcProvider(network.rpcUrl, network.chainId, {
      staticNetwork: true
    })
    const call = ethCallVia(provider)

    setSnapshot((previous) => ({
      key,
      balances: previous.key === key ? previous.balances : noBalances,
      isLoading: true
    }))

    // `allSettled`, never `all`: a self-destructed contract, or one public RPC
    // rate-limiting a single call, has to fail its own row and leave the rest.
    Promise.allSettled(
      tokens.map((token) => readTokenBalance(call, token, address))
    ).then((results) => {
      if (!active) return

      const balances: Record<string, TokenBalanceState> = {}
      results.forEach((result, index) => {
        balances[tokens[index].key] =
          result.status === "fulfilled"
            ? { value: result.value, error: null }
            : {
                value: null,
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : "读取余额失败"
              }
      })

      setSnapshot({ key, balances, isLoading: false })
    })

    return () => {
      active = false
      provider.destroy()
    }
  }, [address, network.chainId, network.rpcUrl, tokens, attempt])

  return {
    balances: snapshot.balances,
    isLoading: snapshot.isLoading,
    refresh
  }
}

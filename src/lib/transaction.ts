import { isAddress, parseEther } from "ethers"

export interface NativeTransfer {
  to: string
  value: bigint
}

/**
 * Builds a native-coin transfer from user-facing decimal strings. All
 * comparisons happen in wei so values with many decimals cannot be rounded by
 * JavaScript floating point arithmetic.
 */
export const createNativeTransfer = (
  recipient: string,
  amount: string,
  balance: string
): NativeTransfer => {
  const to = recipient.trim()
  if (!isAddress(to)) throw new Error("无效的接收地址")

  const normalizedAmount = amount.trim()
  if (!normalizedAmount) throw new Error("请输入金额")

  let value: bigint
  let available: bigint
  try {
    value = parseEther(normalizedAmount)
    available = parseEther(balance)
  } catch {
    throw new Error("无效的金额")
  }

  if (value <= 0n) throw new Error("金额必须大于 0")
  if (value > available) throw new Error("余额不足")
  if (value === available) throw new Error("请预留网络手续费")

  return { to, value }
}

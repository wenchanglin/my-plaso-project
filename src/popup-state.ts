/**
 * Pure view-state mapping for the popup's authorization panel, kept separate
 * from React so the four possible screens can be asserted in Node.
 */
import type { PendingAuthorization } from "./lib/authorization.ts"

export interface PopupStateInput {
  isLoading: boolean
  pending?: PendingAuthorization | null
  error?: string | null
}

export type PopupState =
  | { kind: "loading"; title: string }
  | { kind: "authorization"; title: string }
  | { kind: "empty"; title: string }
  | { kind: "error"; title: string; error: string }

export const getPopupState = ({
  isLoading,
  pending,
  error
}: PopupStateInput): PopupState => {
  if (isLoading) return { kind: "loading", title: "正在检查授权请求" }
  if (error) return { kind: "error", title: "无法读取授权请求", error }
  if (pending) return { kind: "authorization", title: "是否同意授权" }
  return { kind: "empty", title: "没有待处理的授权请求" }
}

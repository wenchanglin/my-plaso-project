import test from "node:test"
import assert from "node:assert/strict"

import { getPopupState } from "../src/popup-state.ts"

test("shows loading while the popup reads the pending authorization", () => {
  assert.deepEqual(getPopupState({ isLoading: true }), {
    kind: "loading",
    title: "正在检查授权请求"
  })
})

test("shows the authorization decision when a request is pending", () => {
  assert.deepEqual(
    getPopupState({
      isLoading: false,
      pending: { requestId: "request-1", decisionKey: "decision-1" }
    }),
    {
      kind: "authorization",
      title: "是否同意授权"
    }
  )
})

test("shows an actionable empty state when there is no pending request", () => {
  assert.deepEqual(getPopupState({ isLoading: false }), {
    kind: "empty",
    title: "没有待处理的授权请求"
  })
})

test("shows a retry state when loading the request fails", () => {
  assert.deepEqual(
    getPopupState({
      isLoading: false,
      error: "读取授权请求失败"
    }),
    {
      kind: "error",
      title: "无法读取授权请求",
      error: "读取授权请求失败"
    }
  )
})

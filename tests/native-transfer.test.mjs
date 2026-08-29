import test from "node:test"
import assert from "node:assert/strict"

import { createNativeTransfer } from "../src/lib/transaction.ts"

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

test("builds a native transfer with exact wei value", () => {
  assert.deepEqual(
    createNativeTransfer(ADDRESS, "0.125", "1.000000000000000000"),
    {
      to: ADDRESS,
      value: 125000000000000000n
    }
  )
})

test("rejects invalid recipient, amount, and insufficient balance", () => {
  assert.throws(
    () => createNativeTransfer("not-an-address", "1", "2"),
    /无效的接收地址/
  )
  assert.throws(
    () => createNativeTransfer(ADDRESS, "0", "2"),
    /金额必须大于 0/
  )
  assert.throws(
    () => createNativeTransfer(ADDRESS, "1.000000000000000001", "1"),
    /余额不足/
  )
})

test("rejects malformed amounts instead of using floating point parsing", () => {
  assert.throws(
    () => createNativeTransfer(ADDRESS, "1e-3", "2"),
    /无效的金额/
  )
})

test("requires some native balance to remain for the network fee", () => {
  assert.throws(
    () => createNativeTransfer(ADDRESS, "1", "1"),
    /预留网络手续费/
  )
})

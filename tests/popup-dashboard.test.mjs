import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")

const indexSource = read("../src/pages/Index.tsx")
const dashboardSource = read("../src/components/wallet/WalletDashboard.tsx")

test("the unlocked popup lands on the dashboard", () => {
  assert.match(indexSource, /<WalletDashboard \/>/)
  assert.match(
    indexSource,
    /from "\.\.\/components\/wallet\/WalletDashboard\.tsx"/
  )
  assert.doesNotMatch(indexSource, /AccountPanel/)
})

test("the dashboard navigates with the shared tabs, not its own buttons", () => {
  assert.match(dashboardSource, /from "\.\.\/ui\/tabs\.tsx"/)
  for (const value of ["overview", "accounts", "networks", "connections"]) {
    assert.match(dashboardSource, new RegExp(`<TabsTrigger value="${value}">`))
    assert.match(dashboardSource, new RegExp(`<TabsContent value="${value}">`))
  }
  assert.match(dashboardSource, /<TabsTrigger value="send">转账<\/TabsTrigger>/)
  assert.match(dashboardSource, /<TabsContent value="send">[\s\S]*<SendTransaction \/>/)
  assert.match(dashboardSource, /from "\.\/SendTransaction\.tsx"/)
})

test("the send screen uses exact native transfer validation and the wallet store gateway", () => {
  const sendSource = read("../src/components/wallet/SendTransaction.tsx")
  assert.match(sendSource, /createNativeTransfer\(recipient, amount, balance\.balance\)/)
  assert.match(sendSource, /sendTransaction\([\s\S]*account\.address,[\s\S]*to: transfer\.to,[\s\S]*value: transfer\.value[\s\S]*network/)
  assert.match(sendSource, /交易已发送/)
})

test("shows the exact native balance without rounding", () => {
  const sendSource = read("../src/components/wallet/SendTransaction.tsx")
  assert.doesNotMatch(dashboardSource, /formatBalance\(balance\.balance\)/)
  assert.doesNotMatch(sendSource, /formatBalance\(balance\.balance/)
  assert.match(dashboardSource, /balance\.balance/)
  assert.match(sendSource, /\$\{balance\.balance\} \$\{network\.symbol\}/)
})

test("the port drops the reference implementation's rough edges", () => {
  // Debug logging of the account and the network object.
  assert.doesNotMatch(dashboardSource, /console\.log/)
  // A full-page shell inside a 400px popup.
  assert.doesNotMatch(dashboardSource, /min-h-screen|max-w-2xl/)
  // Theme tokens and literal colors that only exist in the reference project.
  assert.doesNotMatch(dashboardSource, /wallet-gradient|rgb\(/)
  // Native balance must remain the exact RPC decimal string, not a rounded value.
  assert.doesNotMatch(dashboardSource, /parseFloat/)
  assert.match(dashboardSource, /balance\.balance}/)
})

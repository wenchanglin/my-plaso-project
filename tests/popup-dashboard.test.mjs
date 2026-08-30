import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")

/**
 * Comments in these files name the very markup the port dropped — `TokenList`
 * explains why there is no `<img src>` — so an assertion that some element is
 * absent has to read the code alone.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

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
  assert.match(dashboardSource, /<TabsTrigger value="tokens">代币<\/TabsTrigger>/)
  assert.match(dashboardSource, /<TabsContent value="tokens">[\s\S]*<TokenList \/>/)
  assert.match(dashboardSource, /from "\.\/TokenList\.tsx"/)
})

test("the token send screen uses ERC-20 units, never ether units", () => {
  const tokenSendSource = read("../src/components/wallet/SendToken.tsx")
  assert.match(tokenSendSource, /createTokenTransfer\(token, recipient, amount, balance\)/)
  // `parseEther` would silently treat every token as 18 decimals; the amount is
  // scaled by `token.decimals` inside `createTokenTransfer`.
  assert.doesNotMatch(tokenSendSource, /parseEther/)
  // A token transfer carries its amount in `data`, so `value` must stay unset.
  assert.match(tokenSendSource, /to: transfer\.to, data: transfer\.data/)
  assert.doesNotMatch(tokenSendSource, /value: transfer/)
})

test("the token list shows the contract address next to every forgeable symbol", () => {
  const listSource = read("../src/components/wallet/TokenList.tsx")
  assert.match(listSource, /shortAddress\(token\.address\)/)
  // The reference implementation rendered a user-supplied URL into `<img src>`,
  // leaking holdings and IP to whatever host owned it.
  const listMarkup = withoutComments(listSource)
  assert.doesNotMatch(listMarkup, /<img/)
  assert.doesNotMatch(listMarkup, /\.image/)
})

test("the add form explains a failed detection and drops the stale message", () => {
  const listSource = read("../src/components/wallet/TokenList.tsx")
  // `eth_getCode` is what tells "wrong network" apart from "not a token".
  assert.match(
    listSource,
    /detectTokenStandard\(call, candidate, codeVia\(provider\)\)/
  )
  // Picking the standard by hand after a failed detection used to leave
  // 无法识别合约类型 on screen, which reads as the choice not taking.
  assert.match(listSource, /const chooseStandard = [\s\S]{0,80}setFormError\(null\)/)
  assert.match(listSource, /const editAddress = [\s\S]{0,80}setFormError\(null\)/)
  assert.match(listSource, /onChange=\{\(event\) =>\s*chooseStandard\(/)
  assert.match(listSource, /onChange=\{\(event\) => editAddress\(/)
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

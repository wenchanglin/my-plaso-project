import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

// The dApp provider only works when three declarations agree, and every way they
// can disagree fails silently: Plasmo registers the MAIN-world script through
// chrome.scripting.registerContentScripts and swallows the rejection, so a
// missing host permission looks exactly like a page that never loaded the
// wallet. These tests make the drift loud instead.

const at = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

// Read from `export const config` onward so prose in the comments above it
// cannot be mistaken for the declaration. Stripping comments instead would
// corrupt the patterns themselves, which contain `//`.
const configOf = async (path) => {
  const source = await readFile(at(path), "utf8")
  const start = source.indexOf("export const config")
  assert.notEqual(start, -1, `${path} exports no config`)
  return source.slice(start)
}

const readMatches = async (path) => {
  const block = /matches:\s*\[([^\]]*)\]/.exec(await configOf(path))
  assert.ok(block, `${path} declares no matches array`)

  const patterns = [...block[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value)
  assert.ok(patterns.length > 0, `${path} declares an empty matches array`)
  return patterns
}

const readHostPermissions = async () => {
  const manifest = JSON.parse(await readFile(at("package.json"), "utf8")).manifest
  return manifest?.host_permissions ?? []
}

test("both content scripts inject into exactly the same hosts", async () => {
  const [provider, bridge] = await Promise.all([
    readMatches("src/contents/injected-helper.ts"),
    readMatches("src/contents/message-bridge.ts")
  ])

  // The MAIN-world provider cannot call chrome.runtime on its own. A host that
  // gets the provider without the bridge accepts requests and never answers.
  assert.deepEqual(
    [...provider].sort(),
    [...bridge].sort(),
    "injected-helper.ts and message-bridge.ts must list the same matches"
  )
})

test("every injected host is also a host permission", async () => {
  const [matches, hostPermissions] = await Promise.all([
    readMatches("src/contents/injected-helper.ts"),
    readHostPermissions()
  ])

  for (const pattern of matches) {
    assert.ok(
      hostPermissions.includes(pattern),
      `${pattern} is injected but missing from manifest.host_permissions`
    )
  }
})

test("local dev origins keep their provider", async () => {
  const matches = await readMatches("src/contents/injected-helper.ts")

  // Match patterns carry no port, so these cover every local dev server port.
  for (const origin of ["http://localhost/*", "http://127.0.0.1/*"]) {
    assert.ok(matches.includes(origin), `${origin} must stay injectable`)
  }
})

test("the matches arrays hold plain string literals", async () => {
  for (const path of [
    "src/contents/injected-helper.ts",
    "src/contents/message-bridge.ts"
  ]) {
    const source = await configOf(path)
    const block = /matches:\s*\[([^\]]*)\]/.exec(source)[1]

    // Plasmo evaluates this config from the AST: it resolves only identifiers
    // declared in the same file, and drops spread elements. Either one turns
    // into a silent `matches: ["<all_urls>"]`.
    assert.ok(!block.includes("..."), `${path} spreads into matches`)
    assert.equal(
      block.replace(/"[^"]*"/g, "").replace(/[,\s]/g, ""),
      "",
      `${path} puts something other than string literals in matches`
    )
  }
})

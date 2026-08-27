import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const popupSource = fs.readFileSync(new URL("../src/popup.tsx", import.meta.url), "utf8")

test("popup entry mounts tooltip and notification providers", () => {
  assert.match(popupSource, /TooltipProvider/)
  assert.match(popupSource, /<Toaster\s*\/>/)
  assert.match(popupSource, /from "\.\/components\/ui\/sonner"/)
})

/**
 * Static server for the test dapp, so the page can be opened over
 * `http://localhost` — the content scripts match `http://localhost/*` and
 * `http://127.0.0.1/*`, and a `file://` URL never gets the injected provider.
 *
 * Node only, no dependencies:  node test-dapp/serve.mjs [port]
 *
 * Bound to the loopback interface: it serves this one directory with no
 * authentication, so it has no business being reachable from the network.
 */
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))
const port = Number(process.argv[2] ?? 8080)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml"
}

createServer(async (request, response) => {
  const requested = decodeURIComponent(
    new URL(request.url ?? "/", "http://localhost").pathname
  )
  const file = resolve(root, `.${requested === "/" ? "/index.html" : requested}`)

  // Resolved first, then checked: a `..` segment is only visible as a path that
  // has left the directory.
  if (!file.startsWith(root)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
    response.end("forbidden")
    return
  }

  try {
    const body = await readFile(file)
    response.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream"
    })
    response.end(body)
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found")
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`test dapp: http://localhost:${port}`)
})

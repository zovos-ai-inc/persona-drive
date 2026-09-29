#!/usr/bin/env node
// Serves sample-app/ as a static site, no dependencies. `node sample-app/serve.mjs [port]`.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  // The contact form and the ticket form post here; the sample app has no backend.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(url.pathname === '/api/export' ? 500 : 201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: url.pathname !== '/api/export' }))
    return
  }
  if (url.pathname === '/api/export') {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{"error":"export worker unavailable"}')
    return
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  if (path.endsWith('/')) path += 'index.html'
  const file = join(root, path)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    createReadStream(join(root, '404.html')).pipe(res)
    return
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, () => {
  console.log(`sample app on http://localhost:${port}/`)
})

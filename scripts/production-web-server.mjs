import { createServer, request as httpRequest } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

export async function createProductionWebServer({ distDir, apiPort = 8787 }) {
  const root = await realpath(distDir)
  const indexPath = join(root, 'index.html')
  if (!(await isFileWithin(root, indexPath))) {
    throw new Error(`Production Web build is missing: ${indexPath}`)
  }

  return createServer(async (request, response) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    } catch {
      response.writeHead(400)
      response.end()
      return
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      proxyApi(request, response, apiPort)
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }

    const candidate = resolve(root, `.${pathname}`)
    const path = await isFileWithin(root, candidate)
      ? candidate
      : extname(pathname) ? null : indexPath
    if (!path) {
      response.writeHead(404)
      response.end()
      return
    }

    try {
      const body = await readFile(path)
      const headers = {
        'Content-Type': contentTypes.get(extname(path)) ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': path === indexPath ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }
      response.writeHead(200, headers)
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch {
      response.writeHead(500)
      response.end()
    }
  })
}

async function isFileWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate)
  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) return false
  try {
    const resolved = await realpath(candidate)
    const resolvedFromRoot = relative(root, resolved)
    if (resolvedFromRoot.startsWith('..') || isAbsolute(resolvedFromRoot)) return false
    return (await stat(resolved)).isFile()
  } catch {
    return false
  }
}

function proxyApi(request, response, apiPort) {
  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: apiPort,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: `127.0.0.1:${apiPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Local API unavailable')
  })
  request.pipe(upstream)
}

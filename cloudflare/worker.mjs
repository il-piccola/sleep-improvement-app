const origin = 'http://localhost:5180'
const forwardedHeaders = ['accept', 'content-type', 'if-none-match', 'if-modified-since']

export default {
  async fetch(request, env, ctx) {
    const allowedEmail = env.ALLOWED_EMAIL?.trim().toLowerCase()
    if (!allowedEmail || !ctx.access?.getIdentity) {
      return new Response('Forbidden', { status: 403 })
    }

    let identity
    try {
      identity = await ctx.access.getIdentity()
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
    if (identity?.email?.toLowerCase() !== allowedEmail) {
      return new Response('Forbidden', { status: 403 })
    }

    const url = new URL(request.url)
    if (!['GET', 'HEAD'].includes(request.method) &&
        !(request.method === 'POST' && url.pathname === '/api/rescan')) {
      return new Response('Method not allowed', { status: 405 })
    }
    if (!env.SLEEP_WEB?.fetch) {
      return new Response('Service unavailable', { status: 503 })
    }

    const headers = new Headers()
    for (const name of forwardedHeaders) {
      const value = request.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    const target = new URL(url.pathname + url.search, origin)
    const upstreamRequest = new Request(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined,
    })

    try {
      const upstream = await env.SLEEP_WEB.fetch(upstreamRequest)
      const responseHeaders = new Headers(upstream.headers)
      responseHeaders.delete('Access-Control-Allow-Origin')
      responseHeaders.delete('Access-Control-Allow-Methods')
      responseHeaders.delete('Access-Control-Allow-Headers')
      responseHeaders.set('Cache-Control', 'private, no-store')
      responseHeaders.set('X-Content-Type-Options', 'nosniff')
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      })
    } catch {
      return new Response('Service unavailable', { status: 503 })
    }
  },
}

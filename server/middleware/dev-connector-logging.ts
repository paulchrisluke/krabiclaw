import { } from 'nitro/h3';

export default defineHandler((event) => {
  if (!import.meta.dev) return

  const url = event.url
  if (
    !url.pathname.startsWith('/api/auth/')
    && !url.pathname.startsWith('/api/mcp')
    && !url.pathname.startsWith('/.well-known/')
  ) return

  const userAgent = (event.req.headers.get('user-agent')) ?? ''
  if (!userAgent.includes('aiohttp') && !userAgent.includes('openai-mcp/')) return

  const startedAt = Date.now()
  event.runtime?.node?.res?.once('finish', () => {
    console.info('[CONNECTOR_REQUEST]', JSON.stringify({
      method: event.req.method,
      path: url.pathname,
      status: event.runtime?.node?.res?.statusCode,
      duration_ms: Date.now() - startedAt,
      content_length: event.runtime?.node?.res?.getHeader('content-length') ?? null,
      ray_id: (event.req.headers.get('cf-ray')) ?? null,
      user_agent: userAgent,
    }))
  })
})
import { defineHandler } from 'nitro';

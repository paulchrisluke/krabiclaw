import { getHeader, getRequestURL } from 'h3'

export default defineEventHandler((event) => {
  if (!import.meta.dev) return

  const url = getRequestURL(event)
  if (
    !url.pathname.startsWith('/api/auth/')
    && !url.pathname.startsWith('/api/mcp')
    && !url.pathname.startsWith('/.well-known/')
  ) return

  const userAgent = getHeader(event, 'user-agent') ?? ''
  if (!userAgent.includes('aiohttp') && !userAgent.includes('openai-mcp/')) return

  const startedAt = Date.now()
  event.node.res.once('finish', () => {
    console.info('[CONNECTOR_REQUEST]', JSON.stringify({
      method: event.method,
      path: url.pathname,
      status: event.node.res.statusCode,
      duration_ms: Date.now() - startedAt,
      content_length: event.node.res.getHeader('content-length') ?? null,
      ray_id: getHeader(event, 'cf-ray') ?? null,
      user_agent: userAgent,
    }))
  })
})

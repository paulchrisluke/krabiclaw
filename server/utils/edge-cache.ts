import { getHeader } from 'h3'
import type { H3Event } from 'h3'

export function buildHtmlCacheKey(event: H3Event): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfRequest = (event.context.cloudflare as any)?.request as Request | undefined
  const host = cfRequest?.headers.get('host')
    ?? cfRequest?.headers.get('x-forwarded-host')
    ?? getHeader(event, 'host')
    ?? getHeader(event, 'x-forwarded-host')
  if (!host) return null
  const hostname = host.split(':')[0] ?? host
  const isWorkersPreviewHost = hostname.endsWith('.workers.dev')
  // On *.workers.dev preview Workers, multiple tenants share one host. Include
  // x-preview-tenant in the key so their cached HTML doesn't collide.
  const previewTenant = isWorkersPreviewHost
    ? (cfRequest?.headers.get('x-preview-tenant')
      ?? getHeader(event, 'x-preview-tenant'))
    : null
  const tenantSuffix = previewTenant ? `:${previewTenant}` : ''
  return `html:${host}${tenantSuffix}:${event.path}`
}

import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

export function buildHtmlCacheKey(event: H3Event): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfRequest = (event.context.cloudflare as any)?.request as Request | undefined
  const host = cfRequest?.headers.get('host')
    ?? cfRequest?.headers.get('x-forwarded-host')
    ?? getHeader(event, 'host')
    ?? getHeader(event, 'x-forwarded-host')
  if (!host) return null
  const hostname = host.split(':')[0] ?? host
  // On hosts where multiple tenants share one hostname (workers.dev, preview.*, staging.*),
  // include x-preview-tenant in the key so their cached HTML doesn't collide.
  const previewTenant = isPreviewContext(hostname)
    ? (cfRequest?.headers.get('x-preview-tenant')
      ?? getHeader(event, 'x-preview-tenant'))
    : null
  const tenantSuffix = previewTenant ? `:${previewTenant}` : ''
  return `html:${host}${tenantSuffix}:${event.path}`
}

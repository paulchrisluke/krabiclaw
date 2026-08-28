import type { H3Event } from 'nitro'
import { sendRedirect } from 'nitro/h3'
import { sanitizeUrl } from '~/utils/sanitize'
import { TENANT_TYPES, type TenantType } from '~/utils/tenant-routing'

interface TenantFaviconSite {
  media?: Array<{ slot: string; public_url: string | null }>
}

export function resolveTenantFaviconRedirect(
  tenantType: TenantType | null | undefined,
  site: TenantFaviconSite | null | undefined,
  platformAssetPath: string,
): string {
  if (tenantType !== TENANT_TYPES.TENANT) return platformAssetPath
  const faviconUrl = site?.media?.find(item => item.slot === 'favicon')?.public_url
  const sanitized = sanitizeUrl(faviconUrl, new Set(['http:', 'https:']))
  return sanitized || platformAssetPath
}

export function redirectTenantFavicon(event: H3Event, platformAssetPath: string) {
  const site = event.context.site as TenantFaviconSite | undefined
  const tenantType = event.context.tenantType as TenantType | undefined
  return sendRedirect(event, resolveTenantFaviconRedirect(tenantType, site, platformAssetPath), 302)
}

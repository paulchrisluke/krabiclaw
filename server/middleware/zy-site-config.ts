import { defineHandler } from 'nitro';

import { updateSiteConfig } from '#site-config/server/composables'
import { resolveRuntimeSeoSiteConfig } from '~/server/utils/seo-policy'
import type { TenantType } from '~/utils/tenant-routing'

const SITE_CONFIG_PATHS = new Set(['/robots.txt', '/sitemap.xml'])

export default defineHandler((event) => {
  const requestURL = event.url
  if (!SITE_CONFIG_PATHS.has(requestURL.pathname)) return

  const site = event.context.site as { brand_name?: string | null } | undefined
  const siteConfig = resolveRuntimeSeoSiteConfig({
    tenantType: event.context.tenantType as TenantType | null | undefined,
    origin: requestURL.origin,
    hostname: requestURL.hostname,
    tenantName: site?.brand_name,
  })

  updateSiteConfig(event, siteConfig)
})

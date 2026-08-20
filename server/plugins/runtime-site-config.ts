import { definePlugin } from 'nitro'

import { isPrivateSeoPath, resolveRuntimeSeoSiteConfig } from '~/server/utils/seo-policy'
import type { TenantType } from '~/utils/tenant-routing'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('site-config:init', ({ event, siteConfig }) => {
    const requestURL = event.url
    if (isPrivateSeoPath(requestURL.pathname)) return

    const site = event.context.site as { brand_name?: string | null } | undefined

    siteConfig.push({
      _context: 'runtime-tenant',
      ...resolveRuntimeSeoSiteConfig({
        tenantType: event.context.tenantType as TenantType | null | undefined,
        origin: requestURL.origin,
        hostname: requestURL.hostname,
        tenantName: site?.brand_name,
      }),
    })
  })
})

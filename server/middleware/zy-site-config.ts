import { defineEventHandler, getRequestURL } from 'h3'
import { updateSiteConfig } from '#site-config/server/composables'
import { resolveRuntimeSeoSiteConfig } from '~/server/utils/seo-policy'

const SITE_CONFIG_PATHS = new Set(['/robots.txt', '/sitemap.xml'])

export default defineEventHandler((event) => {
  const requestURL = getRequestURL(event)
  if (!SITE_CONFIG_PATHS.has(requestURL.pathname)) return

  const siteConfig = resolveRuntimeSeoSiteConfig({
    tenantType: event.context.tenantType,
    origin: requestURL.origin,
    hostname: requestURL.hostname,
    tenantName: event.context.site?.brand_name,
  })

  updateSiteConfig(event, siteConfig)
})

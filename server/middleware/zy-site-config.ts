import { defineEventHandler, getRequestURL } from 'h3'
import { updateSiteConfig } from '#site-config/server/composables'
import { resolveRuntimeSeoSiteConfig } from '~/server/utils/seo-policy'

export default defineEventHandler((event) => {
  const requestURL = getRequestURL(event)
  const siteConfig = resolveRuntimeSeoSiteConfig({
    tenantType: event.context.tenantType,
    origin: requestURL.origin,
    hostname: requestURL.hostname,
    tenantName: event.context.site?.brand_name,
  })

  updateSiteConfig(event, siteConfig)
})

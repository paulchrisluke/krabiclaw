import { defineEventHandler, getRequestURL } from 'h3'
import { updateSiteConfig } from '#site-config/server/composables'
import { isNonIndexableHost } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineEventHandler((event) => {
  const requestURL = getRequestURL(event)
  const indexable = !isNonIndexableHost(requestURL.hostname)

  if (event.context.tenantType === TENANT_TYPES.TENANT) {
    const tenantName = String(event.context.site?.brand_name || '').trim()
    updateSiteConfig(event, {
      url: requestURL.origin,
      indexable,
      ...(tenantName ? { name: tenantName } : {}),
    })
    return
  }

  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    updateSiteConfig(event, {
      name: 'KrabiClaw',
      url: indexable ? 'https://krabiclaw.com' : requestURL.origin,
      indexable,
    })
    return
  }

  updateSiteConfig(event, {
    url: requestURL.origin,
    indexable: false,
  })
})

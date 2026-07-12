import { createError, defineEventHandler, getRequestURL } from 'h3'
import { isTenantOnlySeoPath } from '~/server/utils/seo-policy'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineEventHandler((event) => {
  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return

  const pathname = getRequestURL(event).pathname
  if (!isTenantOnlySeoPath(pathname)) return

  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
  })
})

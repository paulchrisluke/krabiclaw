import { sendRedirect } from 'h3'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineEventHandler((event) => {
  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    return sendRedirect(event, '/platform/site.webmanifest', 302)
  }

  return sendRedirect(event, '/tenant.webmanifest', 302)
})
import { defineEventHandler } from 'h3'

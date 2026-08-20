import { sendRedirect } from 'nitro/h3';
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineHandler((event) => {
  if (event.context.tenantType === TENANT_TYPES.PLATFORM) {
    return sendRedirect(event, '/platform/site.webmanifest', 302)
  }

  return sendRedirect(event, '/tenant.webmanifest', 302)
})
import { defineHandler } from 'nitro';

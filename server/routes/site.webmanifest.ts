import { sendRedirect, getHeader } from 'h3'
import { isPlatformHost } from '~/server/utils/tenant-hosts'
import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler((event) => {
  const host = getHeader(event, 'host') || ''
  const env = cloudflareEnv(event)

  if (event.context.tenantType === 'PLATFORM' || isPlatformHost(host, env)) {
    return sendRedirect(event, '/platform/site.webmanifest', 302)
  }

  return sendRedirect(event, '/tenant.webmanifest', 302)
})

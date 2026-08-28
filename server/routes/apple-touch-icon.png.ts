import { defineHandler } from 'nitro'
import { redirectTenantFavicon } from '~/server/utils/tenant-favicon'

export default defineHandler((event) => {
  return redirectTenantFavicon(event, '/platform/apple-touch-icon.png')
})

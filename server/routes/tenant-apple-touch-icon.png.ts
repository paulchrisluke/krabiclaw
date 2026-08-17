import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineHandler((event) => {
  return handleFaviconRequest(event, {
    platformFileName: 'tenant-apple-touch-icon.png', width: 180, height: 180, })
})
import { defineHandler } from 'nitro';

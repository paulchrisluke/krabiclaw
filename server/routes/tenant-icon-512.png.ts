import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineHandler((event) => {
  return handleFaviconRequest(event, {
    platformFileName: 'web-app-manifest-512x512.png', width: 512, height: 512, })
})
import { defineHandler } from 'nitro';

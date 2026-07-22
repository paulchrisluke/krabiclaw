import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'web-app-manifest-192x192.png', width: 192, height: 192, format: 'png' })
})

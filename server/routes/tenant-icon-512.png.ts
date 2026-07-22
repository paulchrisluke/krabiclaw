import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'web-app-manifest-512x512.png', width: 512, height: 512, format: 'png' })
})

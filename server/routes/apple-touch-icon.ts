import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'apple-touch-icon.png', width: 180, height: 180, format: 'png' })
})

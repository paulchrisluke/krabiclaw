import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'favicon-96x96.png', width: 96, height: 96, format: 'png' })
})

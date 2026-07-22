import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, 'favicon-96x96.png')
})

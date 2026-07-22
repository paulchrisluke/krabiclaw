import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, 'favicon.svg')
})

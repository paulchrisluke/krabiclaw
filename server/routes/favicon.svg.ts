import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineEventHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'favicon.svg', returnSvg: true })
})

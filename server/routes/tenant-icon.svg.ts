import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'favicon.svg', returnSvg: true })
})
import { defineHandler } from 'nitro';

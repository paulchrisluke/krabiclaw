import { handleFaviconRequest } from '~/server/utils/tenant-favicon'

export default defineHandler((event) => {
  return handleFaviconRequest(event, { platformFileName: 'favicon.ico', width: 96, height: 96 })
})
import { defineHandler } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationCopyPreviews } from '~/server/utils/notifications'

export default defineEventHandler(async () => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return jsonResponse({ previews: getNotificationCopyPreviews() })
})

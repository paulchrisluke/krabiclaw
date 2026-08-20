import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationCopyPreviews } from '~/server/utils/notifications'

export default defineHandler(async () => {
  if (!import.meta.dev) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return jsonResponse({ previews: await getNotificationCopyPreviews() })
})

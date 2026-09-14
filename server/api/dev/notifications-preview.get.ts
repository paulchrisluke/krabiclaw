import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { renderNotificationCatalog } from '~/server/utils/notifications'

export default defineHandler(async () => {
  if (!import.meta.dev) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return jsonResponse({ entries: await renderNotificationCatalog() })
})

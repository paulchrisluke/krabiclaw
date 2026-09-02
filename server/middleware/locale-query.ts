import { defineHandler } from 'nitro'

import { localizationError } from '~/server/utils/localization-errors'

export default defineHandler((event) => {
  const url = new URL(event.req.url)
  if (!url.searchParams.has('locale')) return
  const path = url.pathname
  // Allow locale query parameter for preview URLs
  if (path.startsWith('/preview/')) return
  if (!path.startsWith('/api/')) {
    localizationError(400, 'LOCALE_QUERY_UNSUPPORTED', 'Public locale selection must use an exact locale-prefixed path')
  }
})

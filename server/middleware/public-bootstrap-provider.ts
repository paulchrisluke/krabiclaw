import type { PublicBootstrapProvider } from '~/utils/public-bootstrap-provider'
import { loadPublicDraftBootstrap } from '~/server/utils/public-draft-bootstrap'
import { loadPublicPage, loadPublicShell } from '~/server/utils/public-bootstrap'

export default defineEventHandler((event) => {
  const provider: PublicBootstrapProvider = async (options) => {
    options.signal?.throwIfAborted()
    if (options.draftId) {
      return await loadPublicDraftBootstrap(event, options.draftId, options.query, {
        signal: options.signal,
      })
    }
    if (!options.siteId) {
      throw createError({ statusCode: 500, statusMessage: 'Public bootstrap site context unavailable' })
    }
    if (options.query.contract === 'shell') {
      return await loadPublicShell(event, options.siteId, {
        locale: options.query.locale,
        token: options.query.token,
      }, {
        mutateResponseHeaders: false,
        signal: options.signal,
      })
    }
    return await loadPublicPage(event, options.siteId, options.query, {
      mutateResponseHeaders: false,
      signal: options.signal,
    })
  }
  event.context.publicBootstrapProvider = provider
})

import type { PublicBootstrapProvider } from '~/utils/public-bootstrap-provider'
import { loadPublicDraftBootstrap } from '~/server/utils/public-draft-bootstrap'
import { loadPublicPage, loadPublicShell } from '~/server/utils/public-bootstrap'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler((event) => {
  const provider: PublicBootstrapProvider = async (options) => {
    options.signal?.throwIfAborted()
    if (options.draftId) {
      const payload = await loadPublicDraftBootstrap(event, options.draftId, options.query, {
        signal: options.signal,
      })
      return finalizeRequestMetrics(event, `public-draft-${options.query.contract ?? 'page'}`, payload)
    }
    if (!options.siteId) {
      throw createError({ statusCode: 500, statusMessage: 'Public bootstrap site context unavailable' })
    }
    if (options.query.contract === 'shell') {
      const payload = await loadPublicShell(event, options.siteId, {
        locale: options.query.locale,
        token: options.query.token,
      }, {
        mutateResponseHeaders: false,
        signal: options.signal,
      })
      return finalizeRequestMetrics(event, 'public-shell-ssr', payload)
    }
    const payload = await loadPublicPage(event, options.siteId, options.query, {
      mutateResponseHeaders: false,
      signal: options.signal,
    })
    return finalizeRequestMetrics(event, 'public-page-ssr', payload)
  }
  event.context.publicBootstrapProvider = provider
})

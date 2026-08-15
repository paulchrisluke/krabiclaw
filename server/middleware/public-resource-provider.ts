import type { PublicResourceProvider } from '~/utils/public-resource-provider'
import { loadPublicDraftPage, loadPublicDraftShell } from '~/server/utils/public-draft-bootstrap'
import { loadPublicPage } from '~/server/utils/public-page'
import { loadPublicShell } from '~/server/utils/public-shell'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler((event) => {
  const provider: PublicResourceProvider = async (options) => {
    options.signal?.throwIfAborted()
    if (options.draftId) {
      const payload = options.resourceKind === 'shell'
        ? await loadPublicDraftShell(event, options.draftId, options.query, { signal: options.signal })
        : await loadPublicDraftPage(event, options.draftId, options.query, { signal: options.signal })
      return finalizeRequestMetrics(event, `public-draft-${options.resourceKind}`, payload)
    }
    if (!options.siteId) {
      throw createError({ statusCode: 500, statusMessage: 'Public site context unavailable' })
    }
    if (options.resourceKind === 'shell') {
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
  event.context.publicResourceProvider = provider
})
import { defineEventHandler } from 'h3'

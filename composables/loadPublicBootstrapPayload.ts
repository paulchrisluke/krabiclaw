import type { H3Event } from 'h3'

interface PublicBootstrapLoadOptions<T> {
  draftId: string | null
  siteId: string | null
  requestEvent: H3Event | undefined
  requestFetch: <R>(_request: string) => Promise<R>
  url: string
  key: string
  query: Record<string, string | undefined>
  validate: Validator<T>
  failureMessage: string
  signal?: AbortSignal
}

export async function loadPublicBootstrapPayload<T>(
  options: PublicBootstrapLoadOptions<T>,
): Promise<T> {
  if (import.meta.server) {
    if (options.draftId) return await options.requestFetch<T>(options.url)
    if (!options.requestEvent || !options.siteId) {
      throw createError({ statusCode: 500, statusMessage: `${options.failureMessage} context unavailable` })
    }
    const { loadPublicPage, loadPublicShell } = await import('~/server/utils/public-bootstrap')
    if (options.query.contract === 'shell') {
      return await loadPublicShell(options.requestEvent, options.siteId, {
        locale: options.query.locale,
        token: options.query.token,
      }) as T
    }
    return await loadPublicPage(options.requestEvent, options.siteId, options.query) as T
  }

  return await publicApiRequest<T>(options.url, {
    signal: options.signal,
    validate: options.validate,
  })
}

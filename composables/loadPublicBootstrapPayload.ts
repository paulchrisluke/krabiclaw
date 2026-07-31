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
}

export async function loadPublicBootstrapPayload<T>(
  options: PublicBootstrapLoadOptions<T>,
): Promise<T> {
  if (import.meta.server) {
    if (options.draftId) return await options.requestFetch<T>(options.url)
    if (!options.requestEvent || !options.siteId) {
      throw createError({ statusCode: 500, statusMessage: `${options.failureMessage} context unavailable` })
    }
    const { handlePublicBootstrap } = await import('~/server/utils/public-bootstrap')
    const response = await handlePublicBootstrap(
      options.requestEvent,
      options.siteId,
      options.query,
      { mutateResponseHeaders: false },
    )
    if (!response.ok) {
      throw createError({ statusCode: response.status, statusMessage: options.failureMessage })
    }
    return await response.json() as T
  }

  return await publicApiRequest<T>(options.url, {
    coalesceKey: options.key,
    validate: options.validate,
  })
}

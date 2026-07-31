interface PublicResourceLoadOptions<T> {
  draftId: string | null
  siteId: string | null
  resourceKind: 'shell' | 'page'
  url: string
  key: string
  query: Record<string, string | undefined>
  validate: Validator<T>
  failureMessage: string
  signal?: AbortSignal
}

export async function loadPublicResourcePayload<T>(
  options: PublicResourceLoadOptions<T>,
): Promise<T> {
  const providerOptions = {
    draftId: options.draftId,
    siteId: options.siteId,
    resourceKind: options.resourceKind,
    url: options.url,
    query: options.query,
    signal: options.signal,
  }
  const value = import.meta.server
    ? await (useRequestEvent()?.context.publicResourceProvider as
        | import('~/utils/public-resource-provider').PublicResourceProvider
        | undefined)?.(providerOptions)
    : await publicApiRequest<T>(options.url, {
        coalesceKey: options.key,
        signal: options.signal,
        validate: options.validate,
      })
  if (value === undefined) {
    throw createError({ statusCode: 500, statusMessage: `${options.failureMessage} provider unavailable` })
  }
  if (!options.validate(value)) {
    throw new ApiClientError(
      `${options.failureMessage}: response did not match its contract`,
      502,
      'INVALID_API_RESPONSE',
      null,
    )
  }
  return value
}

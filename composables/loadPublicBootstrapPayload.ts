interface PublicBootstrapLoadOptions<T> {
  draftId: string | null
  siteId: string | null
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
  const providerOptions = {
    draftId: options.draftId,
    siteId: options.siteId,
    url: options.url,
    query: options.query,
    signal: options.signal,
  }
  const value = import.meta.server
    ? await (useRequestEvent()?.context.publicBootstrapProvider as
        | import('~/utils/public-bootstrap-provider').PublicBootstrapProvider
        | undefined)?.(providerOptions)
    : await publicApiRequest<unknown>(options.url, {
        signal: options.signal,
        validate: (_value): _value is unknown => true,
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

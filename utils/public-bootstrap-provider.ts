export interface PublicBootstrapProviderOptions {
  draftId: string | null
  siteId: string | null
  url: string
  query: Record<string, string | undefined>
  signal?: AbortSignal
}

export type PublicBootstrapProvider = (
  _options: PublicBootstrapProviderOptions,
) => Promise<unknown>

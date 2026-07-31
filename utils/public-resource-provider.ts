export interface PublicResourceProviderOptions {
  draftId: string | null
  siteId: string | null
  resourceKind: 'shell' | 'page'
  url: string
  query: Record<string, string | undefined>
  signal?: AbortSignal
}

export type PublicResourceProvider = (
  _options: PublicResourceProviderOptions,
) => Promise<unknown>

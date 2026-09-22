export interface PublicResourceProviderOptions {
  organizationId: string | null
  resourceKind: 'shell' | 'page'
  url: string
  query: Record<string, string | undefined>
  signal?: AbortSignal
}

export type PublicResourceProvider = (
  _options: PublicResourceProviderOptions,
) => Promise<unknown>

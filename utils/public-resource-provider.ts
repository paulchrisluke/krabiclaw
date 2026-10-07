export interface PublicResourceProviderOptions {
  organizationId: string | null
  resourceKind: 'shell' | 'page' | 'config'
  url: string
  query: Record<string, string | undefined>
  signal?: AbortSignal
}

export type PublicResourceProvider = (
  _options: PublicResourceProviderOptions,
) => Promise<unknown>

export interface SiteCreationResponse {
  siteId: string
}

export function isSiteCreationResponse(value: unknown): value is SiteCreationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return 'siteId' in value && typeof value.siteId === 'string'
}

export interface SiteCreationResponse {
  organizationId: string
}

export function isSiteCreationResponse(value: unknown): value is SiteCreationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return 'organizationId' in value && typeof value.organizationId === 'string'
}

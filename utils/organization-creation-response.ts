export interface OrganizationCreationResponse {
  organizationId: string
}

export function isOrganizationCreationResponse(value: unknown): value is OrganizationCreationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return 'organizationId' in value && typeof value.organizationId === 'string'
}

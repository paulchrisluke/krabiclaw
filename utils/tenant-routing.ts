export const TENANT_TYPES = {
  PLATFORM: 'platform',
  TENANT: 'tenant',
  TENANT_404: 'tenant-404',
} as const

export type TenantType = (typeof TENANT_TYPES)[keyof typeof TENANT_TYPES]

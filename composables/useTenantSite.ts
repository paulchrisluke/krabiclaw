import type { TenantType } from '~/utils/tenant-routing'
import { TENANT_TYPES } from '~/utils/tenant-routing'

interface TenantSiteState {
  tenantType: TenantType
  siteId: string | null
  draftId: string | null
  organizationId: string | null
  themeId: string | null
  site: TenantSiteInfo | null
}

interface TenantSiteInfo {
  brand_name?: string | null
  brand_description?: string | null
  logo_url?: string | null
  logo_mime_type?: string | null
  favicon_url?: string | null
  vertical?: string | null
  config?: {
    phone?: string | null
  } | null
}

// Tenant site composable for Saya theme rendering
export const useTenantSite = () => {
  const event = useRequestEvent()

  // Get tenant context from middleware on the server, then reuse the serialized
  // Nuxt state on the client so SSR and hydration choose the same site shell.
  const tenantContext = useState<TenantSiteState>('tenant-context', () => {
    if (event) {
      return {
        tenantType: (event.context.tenantType as TenantType | undefined) || TENANT_TYPES.PLATFORM,
        siteId: event.context.siteId || null,
        draftId: event.context.draftId || null,
        organizationId: event.context.organizationId || null,
        themeId: event.context.themeId || null,
        site: event.context.site || null
      }
    }
    return {
      tenantType: TENANT_TYPES.PLATFORM,
      siteId: null,
      draftId: null,
      organizationId: null,
      themeId: null,
      site: null
    }
  })
  
  return {
    tenantType: tenantContext.value.tenantType,
    isPlatform: tenantContext.value.tenantType === TENANT_TYPES.PLATFORM,
    isTenant: tenantContext.value.tenantType === TENANT_TYPES.TENANT,
    siteId: tenantContext.value.siteId,
    draftId: tenantContext.value.draftId,
    organizationId: tenantContext.value.organizationId,
    themeId: tenantContext.value.themeId,
    site: tenantContext.value.site
  }
}

import type { TenantType } from '~/utils/tenant-routing'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import type { SocialImageSource } from '~/utils/social-metadata'

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
  media?: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string; mime_type: string | null }>
  social_image?: SocialImageSource | null
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
        siteId: typeof event.context.siteId === 'string' ? event.context.siteId : null,
        draftId: typeof event.context.draftId === 'string' ? event.context.draftId : null,
        organizationId: typeof event.context.organizationId === 'string' ? event.context.organizationId : null,
        themeId: typeof event.context.themeId === 'string' ? event.context.themeId : null,
        site: (event.context.site as TenantSiteInfo | null | undefined) ?? null
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

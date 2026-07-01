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
  vertical?: string | null
  config?: {
    phone?: string | null
  } | null
}

interface PublicLocationsResponse {
  success: boolean
  locations: unknown[]
  count: number
}

interface PublicMenuResponse {
  success: boolean
  menu: unknown | null
  message?: string
  siteId?: string
  locationId?: string
  locale?: string
  requestedLocale?: string
  sourceLocale?: string
  currency?: string
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
    isPlatform: tenantContext.value.tenantType === 'platform',
    isTenant: tenantContext.value.tenantType === 'tenant',
    siteId: tenantContext.value.siteId,
    draftId: tenantContext.value.draftId,
    organizationId: tenantContext.value.organizationId,
    themeId: tenantContext.value.themeId,
    site: tenantContext.value.site
  }
}

export const useSiteContent = async (page: string, locationId?: string) => {
  const { siteId, organizationId } = useTenantSite()
  
  if (!siteId || !organizationId) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  
  const { data } = await useFetch(`/api/public/sites/${siteId}/content/${page}`, {
    query: { locationId },
    key: `site-content-${siteId}-${page}-${locationId || 'site-wide'}`
  })
  
  return data
}

export const useSiteLocations = async () => {
  const { isTenant, siteId } = useTenantSite()
  
  if (!isTenant || !siteId) {
    return ref<PublicLocationsResponse>({
      success: true,
      locations: [],
      count: 0,
    })
  }
  
  const { data } = await useFetch<PublicLocationsResponse>(`/api/public/sites/${siteId}/locations`, {
    key: `site-locations-${siteId}`,
    default: () => ({
      success: true,
      locations: [],
      count: 0,
    })
  })
  
  return data
}

export const useSiteMenus = async (locationId?: string) => {
  const { isTenant, siteId } = useTenantSite()
  
  if (!isTenant || !siteId) {
    return ref<PublicMenuResponse>({
      success: true,
      menu: null,
      message: 'No menu available for this scope',
    })
  }
  
  const { data } = await useFetch<PublicMenuResponse>(`/api/public/sites/${siteId}/menus`, {
    query: { locationId },
    key: `site-menus-${siteId}-${locationId || 'site-wide'}`,
    default: () => ({
      success: true,
      menu: null,
      message: 'No menu available for this scope',
    })
  })
  
  return data
}

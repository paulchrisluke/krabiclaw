// Tenant site composable for Saya theme rendering
export const useTenantSite = () => {
  const event = useRequestEvent()

  // Get tenant context from middleware on the server, then reuse the serialized
  // Nuxt state on the client so SSR and hydration choose the same site shell.
  const tenantContext = useState('tenant-context', () => {
    if (event) {
      return {
        tenantType: event.context.tenantType || 'platform',
        siteId: event.context.siteId || null,
        draftId: event.context.draftId || null,
        organizationId: event.context.organizationId || null,
        themeId: event.context.themeId || null,
        site: event.context.site || null
      }
    }
    return {
      tenantType: 'platform',
      siteId: null,
      draftId: null,
      organizationId: null,
      themeId: null,
      site: null
    }
  })
  
  return {
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
  const { siteId, organizationId } = useTenantSite()
  
  if (!siteId || !organizationId) {
    return []
  }
  
  const { data } = await useFetch(`/api/sites/${siteId}/locations`, {
    key: `site-locations-${siteId}`
  })
  
  return data || []
}

export const useSiteMenus = async (locationId?: string) => {
  const { siteId, organizationId } = useTenantSite()
  
  if (!siteId || !organizationId) {
    return []
  }
  
  const { data } = await useFetch(`/api/sites/${siteId}/menus`, {
    query: { locationId },
    key: `site-menus-${siteId}-${locationId || 'site-wide'}`
  })
  
  return data || []
}

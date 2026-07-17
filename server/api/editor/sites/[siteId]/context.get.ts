// Get editor context: organization, site, locations, active scope
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createPreviewToken } from '~/server/utils/preview-token'
import { queryAll, queryFirst } from '~/server/db'

interface SiteRow {
  id: string
  brand_name: string
  subdomain: string
  organization_id: string
  status: string
  onboarding_status: string
  organization_name: string
  vertical: string
  theme_id: string
}

interface LocationRow {
  id: string
  slug: string
  title: string
  is_primary: number | boolean
  status: 'active' | 'inactive' | 'sync_error'
}

interface ParsedLocation extends Omit<LocationRow, 'is_primary'> {
  is_primary: boolean
}

interface EntitlementRow {
  key: string
  value: string
}

interface ScopeItem {
  id: string | null
  label: string
  type: 'brand' | 'location'
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user belongs to organization that owns the site
    const site = await queryFirst<SiteRow>(db, `
      SELECT s.id, s.brand_name, s.subdomain, s.organization_id, s.status, s.onboarding_status, s.vertical, s.theme_id,
             o.name as organization_name
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `, [siteId, session.user.id])
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get active locations
    const locationRows = await queryAll<LocationRow>(db, `
      SELECT id, slug, title, is_primary, status
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, title ASC
    `, [site.organization_id, siteId])

    // Parse locations
    const parsedLocations: ParsedLocation[] = locationRows.map((location) => ({
      ...location,
      is_primary: Boolean(location.is_primary)
    }))

    const entitlementRows = await queryAll<EntitlementRow>(db, `
      SELECT key, value FROM site_entitlements WHERE site_id = ?
    `, [siteId])

    const entitlements = entitlementRows.reduce((acc: Record<string, string | boolean>, row) => {
      acc[row.key] = row.value === 'true' ? true : row.value === 'false' ? false : row.value
      return acc
    }, {})

    if (typeof env.PREVIEW_SECRET !== 'string' || !env.PREVIEW_SECRET) {
      return jsonResponse({
        error: 'PREVIEW_SECRET is required for editor previews'
      }, { status: 500 })
    }

    const previewToken = await createPreviewToken(
      env.PREVIEW_SECRET,
      siteId,
      Date.now() + 60 * 60 * 1000
    )

    // Get content registry for this site/theme
    const { getEditablePages } = await import('../../../../../config/content-registry')
    const { ALL_VERTICALS, normalizeVertical } = await import('../../../../../utils/vertical-copy')
    const normalizedVertical = normalizeVertical(site.vertical)
    if (!ALL_VERTICALS.includes(normalizedVertical as import('../../../../../utils/vertical-copy').SiteVertical)) {
      return jsonResponse({ error: `Unsupported site vertical: ${site.vertical}` }, { status: 422 })
    }
    const vertical = normalizedVertical as import('../../../../../utils/vertical-copy').SiteVertical
    const template = site.theme_id === 'blawby-theme-v1' ? 'blawby' : site.theme_id === 'saya-theme-v1' ? 'saya' : null
    if (!template) return jsonResponse({ error: `Unsupported public template: ${site.theme_id}` }, { status: 422 })
    const editablePages = getEditablePages(vertical)

    // Build scopes array
    const scopes = [
      {
        id: null,
        label: "Brand-wide",
        type: "brand"
      },
      ...parsedLocations.map((location) => ({
        id: location.id,
        label: location.title,
        type: "location"
      }))
    ] as ScopeItem[]

    return jsonResponse({
      success: true,
      context: {
        site: {
          id: site.id,
          brand_name: site.brand_name,
          subdomain: site.subdomain,
          status: site.status,
          onboarding_status: site.onboarding_status,
          vertical,
          template,
          entitlements
        },
        organization: {
          id: site.organization_id,
          name: site.organization_name
        },
        locations: parsedLocations,
        scopes,
        previewToken,
        editablePages
      }
    })
    
  } catch (error) {
    console.error('Failed to get editor context:', error)
    return jsonResponse({ 
      error: 'Failed to get editor context' 
    }, { status: 500 })
  }
})

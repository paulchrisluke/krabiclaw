import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { normalizeVertical } from '~/utils/vertical-copy'

const EMPTY_CHECKLIST = {
  success: true,
  vertical: 'restaurant',
  brandName: null,
  city: null,
  items: {
    business_info: false,
    hero_image: false,
    core_offering: false,
    story: false,
    post: false,
  },
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  // Accept explicit siteId from query to bypass session org resolution
  const querySiteId = getQuery(event).siteId as string | undefined

  let siteId: string
  let brandName: string | null = null

  if (querySiteId) {
    // Verify the user has access to this site before using it
    const session = await getAuthSession(event, env)
    if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

    const site = await queryFirst<{ id: string; brand_name: string | null }>(db, `
      SELECT s.id, s.brand_name
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member m ON o.id = m.organizationId
      WHERE s.id = ? AND m.userId = ?
      LIMIT 1
    `, [querySiteId, session.user.id])

    if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    siteId = site.id
    brandName = site.brand_name
  } else {
    const dashboard = await getDashboardContext(event, { requireSite: false })
    if (!dashboard?.site) return jsonResponse(EMPTY_CHECKLIST)
    siteId = dashboard.site.id
    brandName = dashboard.site.brand_name
  }

  try {
    const vertical = await queryFirst<{ vertical: string; brand_name: string | null }>(
      db, `SELECT vertical, brand_name FROM sites WHERE id = ? LIMIT 1`, [siteId],
    )

    const location = await queryFirst<{ city: string | null; phone: string | null; review_count: number | null; rating: number | null }>(db, `
      SELECT city, phone, review_count, rating FROM business_locations
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1
    `, [siteId])

    const businessInfo = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM business_locations
      WHERE site_id = ? AND status = 'active' AND (
        (phone IS NOT NULL AND phone != '')
        OR (maps_url IS NOT NULL AND maps_url != '')
        OR (google_place_id IS NOT NULL AND google_place_id != '')
      )
    `, [siteId])

    // Hero is "done" once it's no longer the generic stock fallback. Two paths write
    // hero state today: the draft/commit flow (site_config flag) and direct site
    // creation via seedNewSite (business_locations -> media_assets.source).
    const heroConfig = await queryFirst<{ value: string }>(db, `
      SELECT value FROM site_config
      WHERE site_id = ? AND key = 'hero_image_is_placeholder' LIMIT 1
    `, [siteId])

    const heroAsset = await queryFirst<{ source: string | null }>(db, `
      SELECT ma.source as source
      FROM business_locations bl
      JOIN media_assets ma ON ma.id = bl.hero_image_asset_id
      WHERE bl.site_id = ? AND bl.status = 'active' AND ma.status = 'active'
      ORDER BY bl.is_primary DESC, bl.created_at ASC LIMIT 1
    `, [siteId])

    const heroIsReal = heroConfig
      ? heroConfig.value === 'false'
      : heroAsset?.source != null && heroAsset.source !== 'template_stock'

    const menuItems = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM menu_items mi
      JOIN menus m ON mi.menu_id = m.id
      WHERE m.site_id = ?
    `, [siteId])

    const experiences = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM experiences WHERE site_id = ?
    `, [siteId])

    const offerings = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM offerings WHERE site_id = ?
    `, [siteId])

    const story = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM site_content
      WHERE site_id = ? AND page = 'about' AND field LIKE 'story%'
      AND content IS NOT NULL AND length(content) > 20 AND source != 'template'
    `, [siteId])

    const post = await queryFirst<{ c: number }>(db, `
      SELECT COUNT(*) as c FROM posts WHERE site_id = ? AND status = 'published' AND source != 'template'
    `, [siteId])

    // sites.vertical stores 'service' for professional-service tenants (see
    // sites_vertical_check + utils/template-registry.ts); normalize to the
    // canonical 'professional_service' app-level value here so every caller
    // of this endpoint (wizard, checklist UI, useOnboardingPrompts) can do a
    // simple string comparison without re-deriving the storage alias.
    const normalizedVertical = normalizeVertical(vertical?.vertical)

    return jsonResponse({
      success: true,
      vertical: normalizedVertical,
      brandName: vertical?.brand_name ?? brandName,
      city: location?.city ?? null,
      items: {
        business_info: (businessInfo?.c ?? 0) > 0,
        hero_image: heroIsReal,
        // Renamed from menu_or_experiences (#277) since this key isn't
        // menu-shaped. Branches per vertical's real core-offering content
        // model: menu items (restaurant), experiences (experience), or
        // offerings/practice areas (professional_service — see #284, #194,
        // #278's offerings model, already implemented end-to-end in
        // server/utils/professional-services.ts).
        core_offering: normalizedVertical === 'experience'
          ? (experiences?.c ?? 0) > 0
          : normalizedVertical === 'professional_service'
            ? (offerings?.c ?? 0) > 0
            : (menuItems?.c ?? 0) > 0,
        story: (story?.c ?? 0) > 0,
        post: (post?.c ?? 0) > 0,
      },
    })
  } catch (error) {
    console.error('Checklist endpoint error:', error)
    return jsonResponse({ error: 'checklist_error' }, { status: 500 })
  }
})

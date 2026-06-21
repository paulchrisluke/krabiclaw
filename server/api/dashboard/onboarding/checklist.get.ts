import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getAuthSession } from '~/server/utils/auth'

const EMPTY_CHECKLIST = {
  success: true,
  vertical: 'restaurant',
  brandName: null,
  city: null,
  items: {
    business_info: false,
    hero_image: false,
    menu_or_experiences: false,
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

    const site = await db.prepare(`
      SELECT s.id, s.brand_name
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member m ON o.id = m.organizationId
      WHERE s.id = ? AND m.userId = ?
      LIMIT 1
    `).bind(querySiteId, session.user.id).first<{ id: string; brand_name: string | null }>()

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
    const vertical = await db.prepare(`SELECT vertical, brand_name FROM sites WHERE id = ? LIMIT 1`)
      .bind(siteId).first<{ vertical: string; brand_name: string | null }>()

    const location = await db.prepare(`
      SELECT city, phone, review_count, rating FROM business_locations
      WHERE site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1
    `).bind(siteId).first<{ city: string | null; phone: string | null; review_count: number | null; rating: number | null }>()

    const businessInfo = await db.prepare(`
      SELECT COUNT(*) as c FROM business_locations
      WHERE site_id = ? AND status = 'active' AND (
        (phone IS NOT NULL AND phone != '')
        OR (maps_url IS NOT NULL AND maps_url != '')
        OR (google_place_id IS NOT NULL AND google_place_id != '')
      )
    `).bind(siteId).first<{ c: number }>()

    const heroImage = await db.prepare(`
      SELECT COUNT(*) as c FROM site_content
      WHERE site_id = ? AND page = 'home' AND field = 'hero' AND hero_image_asset_id IS NOT NULL
    `).bind(siteId).first<{ c: number }>()

    const menuItems = await db.prepare(`
      SELECT COUNT(*) as c FROM menu_items mi
      JOIN menus m ON mi.menu_id = m.id
      WHERE m.site_id = ?
    `).bind(siteId).first<{ c: number }>()

    const experiences = await db.prepare(`
      SELECT COUNT(*) as c FROM experiences WHERE site_id = ?
    `).bind(siteId).first<{ c: number }>()

    const story = await db.prepare(`
      SELECT COUNT(*) as c FROM site_content
      WHERE site_id = ? AND page = 'about' AND field LIKE 'story%'
      AND content IS NOT NULL AND length(content) > 20
    `).bind(siteId).first<{ c: number }>()

    const post = await db.prepare(`
      SELECT COUNT(*) as c FROM posts WHERE site_id = ? AND status = 'published'
    `).bind(siteId).first<{ c: number }>()

    return jsonResponse({
      success: true,
      vertical: vertical?.vertical ?? 'restaurant',
      brandName: vertical?.brand_name ?? brandName,
      city: location?.city ?? null,
      items: {
        business_info: (businessInfo?.c ?? 0) > 0,
        hero_image: (heroImage?.c ?? 0) > 0,
        menu_or_experiences: vertical?.vertical === 'experience'
          ? (experiences?.c ?? 0) > 0
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

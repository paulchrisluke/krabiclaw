import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const dashboard = await getDashboardContext(event, { requireRestaurant: true })
  if (!dashboard?.restaurant) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const { restaurant, organization } = dashboard
  const siteId = restaurant.id

  const vertical = await db.prepare(`SELECT vertical, brand_name FROM sites WHERE id = ? LIMIT 1`)
    .bind(siteId).first<{ vertical: string; brand_name: string | null }>()

  // Primary location for city
  const location = await db.prepare(`
    SELECT city, phone, review_count, rating FROM business_locations
    WHERE site_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC LIMIT 1
  `).bind(siteId).first<{ city: string | null; phone: string | null; review_count: number | null; rating: number | null }>()

  // Check business info populated (phone or maps_url set means Maps was applied)
  const businessInfo = await db.prepare(`
    SELECT COUNT(*) as c FROM business_locations
    WHERE site_id = ? AND (phone IS NOT NULL OR maps_url IS NOT NULL OR google_place_id IS NOT NULL)
  `).bind(siteId).first<{ c: number }>()

  // Check hero image on home page
  const heroImage = await db.prepare(`
    SELECT COUNT(*) as c FROM site_content
    WHERE site_id = ? AND page = 'home' AND field = 'hero' AND hero_image_asset_id IS NOT NULL
  `).bind(siteId).first<{ c: number }>()

  // Check menu items (restaurant) or experiences
  const menuItems = await db.prepare(`
    SELECT COUNT(*) as c FROM menu_items WHERE site_id = ?
  `).bind(siteId).first<{ c: number }>()

  const experiences = await db.prepare(`
    SELECT COUNT(*) as c FROM experiences WHERE site_id = ?
  `).bind(siteId).first<{ c: number }>()

  // Check story content on about page
  const story = await db.prepare(`
    SELECT COUNT(*) as c FROM site_content
    WHERE site_id = ? AND page = 'about' AND field LIKE 'story%'
    AND content IS NOT NULL AND length(content) > 20
  `).bind(siteId).first<{ c: number }>()

  // Check published post
  const post = await db.prepare(`
    SELECT COUNT(*) as c FROM posts WHERE site_id = ? AND status = 'published'
  `).bind(siteId).first<{ c: number }>()

  return jsonResponse({
    success: true,
    vertical: vertical?.vertical ?? 'restaurant',
    brandName: vertical?.brand_name ?? organization.name,
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
})

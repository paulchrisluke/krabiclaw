import type { H3Event } from 'h3'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { requireSiteAccess } from '~/server/utils/location-access'
import { normalizeVertical } from '~/utils/vertical-copy'

export interface OnboardingChecklist {
  success: true
  vertical: string | null
  brandName: string | null
  city: string | null
  items: {
    business_info: boolean
    hero_image: boolean
    core_offering: boolean
    story: boolean
    post: boolean
  }
}

export const EMPTY_ONBOARDING_CHECKLIST: OnboardingChecklist = Object.freeze({
  success: true as const,
  vertical: null,
  brandName: null,
  city: null,
  items: Object.freeze({
    business_info: false,
    hero_image: false,
    core_offering: false,
    story: false,
    post: false,
  }),
})

interface ChecklistRow {
  vertical: string
  brand_name: string | null
  city: string | null
  business_info: number
  hero_placeholder: string | null
  hero_source: string | null
  menu_items: number
  experiences: number
  offerings: number
  story: number
  post: number
}

export async function loadOnboardingChecklist(
  event: H3Event,
  querySiteId?: string,
): Promise<OnboardingChecklist> {
  const db = cloudflareEnv(event).DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

  let siteId: string
  let brandName: string | null = null
  if (querySiteId) {
    const { site } = await requireSiteAccess(event, querySiteId, 'site-wide')
    siteId = site.id
    brandName = site.brand_name
  } else {
    const dashboard = await getDashboardContext(event, { requireSite: false, requireOrganization: false })
    if (!dashboard?.site) return EMPTY_ONBOARDING_CHECKLIST
    siteId = dashboard.site.id
    brandName = dashboard.site.brand_name
  }

  const row = await queryFirst<ChecklistRow>(db, `
    SELECT
      s.vertical,
      s.brand_name,
      (
        SELECT city FROM business_locations
        WHERE site_id = s.id AND status = 'active'
        ORDER BY is_primary DESC, created_at ASC LIMIT 1
      ) AS city,
      EXISTS(
        SELECT 1 FROM business_locations
        WHERE site_id = s.id AND status = 'active' AND (
          (phone IS NOT NULL AND phone != '')
          OR (maps_url IS NOT NULL AND maps_url != '')
          OR (google_place_id IS NOT NULL AND google_place_id != '')
        )
      ) AS business_info,
      (
        SELECT value FROM site_config
        WHERE site_id = s.id AND key = 'hero_image_is_placeholder' LIMIT 1
      ) AS hero_placeholder,
      (
        SELECT ma.source
        FROM business_locations bl
        JOIN media_assets ma ON ma.id = bl.hero_media_asset_id
        WHERE bl.site_id = s.id AND bl.status = 'active' AND ma.status = 'active'
        ORDER BY bl.is_primary DESC, bl.created_at ASC LIMIT 1
      ) AS hero_source,
      (SELECT COUNT(*) FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.site_id = s.id) AS menu_items,
      (SELECT COUNT(*) FROM experiences WHERE site_id = s.id) AS experiences,
      (SELECT COUNT(*) FROM offerings WHERE site_id = s.id) AS offerings,
      (
        SELECT COUNT(*) FROM site_content
        WHERE site_id = s.id AND page = 'about' AND field LIKE 'story%'
          AND content IS NOT NULL AND length(content) > 20 AND (source IS NULL OR source != 'template')
      ) AS story,
      (
        SELECT COUNT(*) FROM posts
        WHERE site_id = s.id AND status = 'published' AND (source IS NULL OR source != 'template')
      ) AS post
    FROM sites s
    WHERE s.id = ?
    LIMIT 1
  `, [siteId])

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const vertical = normalizeVertical(row.vertical)
  const heroIsReal = row.hero_placeholder !== null
    ? row.hero_placeholder === 'false'
    : row.hero_source !== null && row.hero_source !== 'template_stock'

  return {
    success: true,
    vertical,
    brandName: row.brand_name ?? brandName,
    city: row.city,
    items: {
      business_info: Boolean(row.business_info),
      hero_image: heroIsReal,
      core_offering: vertical === 'experience'
        ? row.experiences > 0
        : vertical === 'professional_service'
          ? row.offerings > 0
          : row.menu_items > 0,
      story: row.story > 0,
      post: row.post > 0,
    },
  }
}

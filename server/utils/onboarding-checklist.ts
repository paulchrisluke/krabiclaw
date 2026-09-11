import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
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
  has_hero: number
  products: number
  service_pages: number
  story: number
  post: number
}

export async function loadOnboardingChecklist(
  event: H3Event,
  querySiteId?: string,
): Promise<OnboardingChecklist> {
  const db = cloudflareEnv(event).DB
  if (!db) throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })

  let siteId: string
  let brandName: string | null
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
      NULL AS city,
      EXISTS(
        SELECT 1 FROM business_locations
        WHERE site_id = s.id AND status = 'active' AND (
          (phone IS NOT NULL AND phone != '')
          OR (maps_url IS NOT NULL AND maps_url != '')
          OR (google_place_id IS NOT NULL AND google_place_id != '')
        )
      ) AS business_info,
      EXISTS(
        SELECT 1 FROM media_placements mp
        JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
        WHERE mp.site_id = s.id AND mp.owner_type = 'business_location' AND mp.slot = 'hero' AND mp.status = 'active'
      ) AS has_hero,
      (SELECT COUNT(DISTINCT p.id) FROM products p
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
        WHERE pub.site_id = s.id AND pub.published = 1 AND p.active = 1) AS products,
      (SELECT COUNT(*) FROM content_documents WHERE site_id = s.id AND row_role = 'root' AND kind = 'page' AND (metadata_json ->> '$.recipe') = 'services') AS service_pages,
      (
        SELECT COUNT(*)
        FROM content_documents v
        JOIN content_blocks b ON b.document_id = v.id
        WHERE v.site_id = s.id AND v.kind = 'page' AND v.row_role = 'root' AND v.path = '/about'
          AND b.type = 'markdown'
          AND length(COALESCE(json_extract(b.data_json, '$.markdown'), '')) > 20
      ) AS story,
      (
        SELECT COUNT(*) FROM content_documents
        WHERE kind = 'social_post' AND row_role = 'root' AND site_id = s.id AND status = 'published' AND source <> 'template'
      ) AS post
    FROM sites s
    WHERE s.id = ?
    LIMIT 1
  `, [siteId])

  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  const vertical = normalizeVertical(row.vertical)
  const heroIsReal = Boolean(row.has_hero)

  return {
    success: true,
    vertical,
    brandName: row.brand_name ?? brandName,
    city: row.city,
    items: {
      business_info: Boolean(row.business_info),
      hero_image: heroIsReal,
      // Every Saya vertical sells Products; only the word for them differs.
      core_offering: vertical === 'service' ? row.service_pages > 0 : row.products > 0,
      story: row.story > 0,
      post: row.post > 0,
    },
  }
}

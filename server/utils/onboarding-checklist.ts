import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { SERVICE_PAGE_SQL } from '~/server/utils/module-content-guard'
import { normalizeVertical } from '~/utils/vertical-copy'

export interface OnboardingChecklist {
  success: true
  vertical: string | null
  brandName: string | null
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
  name: string | null
  business_info: number
  has_hero: number
  products: number
  service_pages: number
  story: number
  post: number
}

export async function loadOnboardingChecklist(
  event: H3Event,
  queryOrganizationId?: string,
): Promise<OnboardingChecklist> {
  const db = cloudflareEnv(event).DB
  if (!db) throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })

  let organizationId: string
  let brandName: string | null
  if (queryOrganizationId) {
    const { organization } = await requireOrganizationAccess(event, queryOrganizationId)
    organizationId = organization.id
    brandName = organization.name
  } else {
    const dashboard = await getDashboardContext(event, { requireOrganization: false })
    if (!dashboard.organization) return EMPTY_ONBOARDING_CHECKLIST
    organizationId = dashboard.organization.id
    brandName = dashboard.organization.name
  }

  const row = await queryFirst<ChecklistRow>(db, `
    SELECT
      s.vertical,
      s.name,
      EXISTS(
        SELECT 1 FROM business_locations
        WHERE organization_id = s.id AND status = 'active' AND (
          (phone IS NOT NULL AND phone != '')
          OR (maps_url IS NOT NULL AND maps_url != '')
          OR (google_place_id IS NOT NULL AND google_place_id != '')
        )
      ) AS business_info,
      EXISTS(
        SELECT 1 FROM media_placements mp
        JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
        WHERE mp.organization_id = s.id AND mp.owner_type = 'business_location' AND mp.slot = 'hero' AND mp.status = 'active'
      ) AS has_hero,
      (SELECT COUNT(DISTINCT p.id) FROM products p
         JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
        WHERE pub.organization_id = s.id AND pub.published = 1 AND p.active = 1) AS products,
      (SELECT COUNT(*) FROM content_documents WHERE organization_id = s.id AND ${SERVICE_PAGE_SQL}) AS service_pages,
      (
        SELECT COUNT(*)
        FROM content_documents v
        JOIN content_blocks b ON b.document_id = v.id
        WHERE v.organization_id = s.id AND v.kind = 'page' AND v.row_role = 'root' AND v.path = '/about'
          AND b.type = 'markdown'
          AND length(COALESCE(json_extract(b.data_json, '$.markdown'), '')) > 20
      ) AS story,
      (
        SELECT COUNT(*) FROM content_documents
        WHERE kind = 'social_post' AND row_role = 'root' AND organization_id = s.id AND status = 'published' AND source <> 'template'
      ) AS post
    FROM organization s
    WHERE s.id = ?
    LIMIT 1
  `, [organizationId])

  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  const vertical = normalizeVertical(row.vertical)
  const heroIsReal = Boolean(row.has_hero)

  return {
    success: true,
    vertical,
    brandName: row.name ?? brandName,
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

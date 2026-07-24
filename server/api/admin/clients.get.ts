// GET /api/admin/clients — orgs on managed service plans
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { queryAll } from '~/server/db'

interface ClientRow {
  org_id: string
  org_name: string
  org_slug: string | null
  plan: string
  site_id: string | null
  brand_name: string | null
  subdomain: string | null
  custom_domain: string | null
  source_locale: string | null
  subscription_status: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  pending_transfer_email: string | null
  impersonation_user_id: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['billing'] })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error)
    return jsonResponse({ error: message }, { status: statusCode })
  }

  const clients = await queryAll<ClientRow>(db, `
    WITH single_site AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC) as rn
      FROM sites
    ),
    pending_transfer AS (
      SELECT from_organization_id, to_email,
             ROW_NUMBER() OVER (PARTITION BY from_organization_id ORDER BY created_at DESC) as rn
      FROM site_transfer_requests
      WHERE status = 'pending'
    ),
    workspace_member AS (
      SELECT organizationId, userId,
             ROW_NUMBER() OVER (
               PARTITION BY organizationId
               ORDER BY
                 CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                 createdAt ASC
             ) as rn
      FROM member
      WHERE role IN ('owner', 'admin')
    )
    SELECT
      o.id AS org_id,
      o.name AS org_name,
      o.slug AS org_slug,
      COALESCE(sb.plan, s.plan, 'free') AS plan,
      s.id AS site_id,
      s.brand_name,
      s.subdomain,
      s.custom_domain,
      s.source_locale,
      sb.status AS subscription_status,
      sb.current_period_end,
      ob.stripe_customer_id,
      sb.stripe_subscription_id,
      pt.to_email AS pending_transfer_email,
      wm.userId AS impersonation_user_id,
      o.createdAt AS created_at
    FROM organization o
    LEFT JOIN organization_billing ob ON ob.organization_id = o.id
    LEFT JOIN single_site s ON s.organization_id = o.id AND s.rn = 1
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    LEFT JOIN pending_transfer pt ON pt.from_organization_id = o.id AND pt.rn = 1
    LEFT JOIN workspace_member wm ON wm.organizationId = o.id AND wm.rn = 1
    WHERE COALESCE(sb.plan, s.plan) IN ('growth', 'managed', 'seo_accelerator')
    ORDER BY
      CASE sb.plan
        WHEN 'seo_accelerator' THEN 0
        WHEN 'managed' THEN 1
        WHEN 'growth' THEN 2
        ELSE 3
      END,
      o.createdAt DESC
  `)

  return jsonResponse({ clients })
})

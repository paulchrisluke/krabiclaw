// GET /api/admin/clients — orgs on managed service plans
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

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
  created_at: string
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const rows = await db.prepare(`
    WITH single_site AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC) as rn
      FROM sites
    )
    SELECT
      o.id AS org_id,
      o.name AS org_name,
      o.slug AS org_slug,
      COALESCE(ob.plan, 'free') AS plan,
      s.id AS site_id,
      s.brand_name,
      s.subdomain,
      s.custom_domain,
      s.source_locale,
      ob.status AS subscription_status,
      ob.current_period_end,
      o.createdAt AS created_at
    FROM organization o
    LEFT JOIN organization_billing ob ON ob.organization_id = o.id
    LEFT JOIN single_site s ON s.organization_id = o.id AND s.rn = 1
    WHERE ob.plan IN ('growth', 'managed', 'seo_accelerator')
    ORDER BY
      CASE ob.plan
        WHEN 'seo_accelerator' THEN 0
        WHEN 'managed' THEN 1
        WHEN 'growth' THEN 2
        ELSE 3
      END,
      o.createdAt DESC
  `).all<ClientRow>()

  return jsonResponse({ clients: rows.results ?? [] })
})

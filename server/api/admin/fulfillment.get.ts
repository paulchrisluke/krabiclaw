// GET /api/admin/fulfillment — historical service add-on records for read-only audit
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll } from '~/server/db'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'

interface HistoricalServiceAddonRow {
  id: string
  organization_id: string
  org_name: string
  org_slug: string | null
  addon_type: string
  stripe_payment_intent_id: string | null
  fulfilled_at: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['fulfillment'] })
  if (permissionDenied) return permissionDenied

  const query = getQuery(event)
  const includeAllHistory = query.all === '1'

  const historicalRecords = await queryAll<HistoricalServiceAddonRow>(db, `
    SELECT
      sap.id,
      sap.organization_id,
      o.name AS org_name,
      o.slug AS org_slug,
      sap.addon_type,
      sap.stripe_payment_intent_id,
      sap.fulfilled_at,
      sap.created_at
    FROM service_addon_purchases sap
    JOIN organization o ON o.id = sap.organization_id
    ${includeAllHistory ? '' : 'WHERE sap.fulfilled_at IS NULL'}
    ORDER BY sap.created_at DESC
    LIMIT 100
  `)

  return jsonResponse({ purchases: historicalRecords })
})

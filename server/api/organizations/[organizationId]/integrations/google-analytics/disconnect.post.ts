import { jsonResponse } from '~/server/utils/api-response'
import { execute } from '~/server/db'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  }

  const { env, db, site } = await requireSiteAccess(event, organizationId)

  const result = await execute(db, `
    UPDATE sites SET integrations_json = json_set(integrations_json, '$.google',
      json_object('kind', 'manual', 'status', 'disabled', 'revision', ?,
        'updated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
    WHERE organization_id = ? AND id = ?
  `, [crypto.randomUUID(), site.organization_id, site.id])

  if (result.meta?.changes !== 1) return jsonResponse({ error: 'Site ownership changed. Reload before disconnecting.' }, { status: 409 })

  try {
    await reconcileZarazAnalytics(env, db)
  } catch (error) {
    console.error('zaraz_reconciliation_failed', { organizationId: site.id, error })
  }

  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';

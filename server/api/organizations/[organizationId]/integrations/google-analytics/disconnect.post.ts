import { jsonResponse } from '~/server/utils/api-response'
import { execute } from '~/server/db'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  }

  const { env, db, organization } = await requireOrganizationAccess(event, organizationId)

  const result = await execute(db, `
    UPDATE organization SET integrations_json = json_set(integrations_json, '$.google',
      json_object('kind', 'manual', 'status', 'disabled', 'revision', ?,
        'updated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
    WHERE organization_id = ? AND id = ?
  `, [crypto.randomUUID(), organization.id, organization.id])

  if (result.meta?.changes !== 1) return jsonResponse({ error: 'Site ownership changed. Reload before disconnecting.' }, { status: 409 })

  try {
    await reconcileZarazAnalytics(env, db)
  } catch (error) {
    console.error('zaraz_reconciliation_failed', { organizationId: organization.id, error })
  }

  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';

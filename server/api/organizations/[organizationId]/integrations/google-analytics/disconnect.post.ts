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
    WHERE id = ?
  `, [crypto.randomUUID(), organization.id])

  if (result.meta?.changes !== 1) return jsonResponse({ error: 'Organization changed. Reload before disconnecting.' }, { status: 409 })

  // Reconciliation is what actually removes the tracking script from the live
  // site. Logging its failure and answering success told the tenant they had
  // disconnected Google Analytics while their visitors were still being tracked.
  await reconcileZarazAnalytics(env, db)

  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';

// PATCH /api/billing/auto-topup
// body: { enabled: boolean, bundle?: 500 | 2500 | 5000 }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { requireBillingAccess } from '~/server/utils/billing'
import { execute, queryFirst } from '~/server/db'

const VALID_BUNDLES = new Set([500, 2500, 5000])

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const member = await queryFirst<{ organizationId: string }>(
    db, 'SELECT organizationId FROM member WHERE userId = ? LIMIT 1', [session.user.id],
  )
  if (!member) return jsonResponse({ error: 'No Organization found' }, { status: 404 })

  const orgId = member.organizationId

  try {
    await requireBillingAccess(env, db, orgId, session.user.id)
  } catch {
    return jsonResponse({ error: 'Only owners can manage billing settings' }, { status: 403 })
  }

  const body = await readBody(event)
  const enabled = body?.enabled === true || body?.enabled === 'true'
  const rawBundle = Number(body?.bundle)
  const bundle = Number.isFinite(rawBundle) && Number.isInteger(rawBundle) ? rawBundle : 500
  const rawThreshold = Number(body?.threshold)
  const threshold = Number.isFinite(rawThreshold) && Number.isInteger(rawThreshold) ? rawThreshold : 100

  if (!VALID_BUNDLES.has(bundle)) {
    return jsonResponse({ error: 'Invalid bundle. Choose 500, 2500, or 5000.' }, { status: 400 })
  }
  if (threshold < 1 || threshold > 10000) {
    return jsonResponse({ error: 'Invalid threshold.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  await execute(db,
    `INSERT INTO organization_billing (id, organization_id, auto_topup_enabled, auto_topup_bundle, auto_topup_threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id) DO UPDATE SET
       auto_topup_enabled = excluded.auto_topup_enabled,
       auto_topup_bundle = excluded.auto_topup_bundle,
       auto_topup_threshold = excluded.auto_topup_threshold,
       updated_at = excluded.updated_at`,
    [`ob-${orgId}`, orgId, enabled ? 1 : 0, bundle, threshold, now],
  )

  return jsonResponse({ success: true, enabled, bundle, threshold })
})

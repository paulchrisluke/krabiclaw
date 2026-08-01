import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  // The onboarding wizard calls this with the siteId it just created/is
  // finishing, rather than the usual dashboard-scope request headers used
  // elsewhere — a brand-new user has no established dashboard scope for
  // that header-based resolution to fall back to.
  const body = await readBody(event).catch(() => ({})) as { siteId?: unknown }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN member m ON m.organizationId = s.organization_id
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  try {
    // sites.onboarding_status has a CHECK constraint allowing only
    // 'pending' | 'active' | 'failed' (schema.ts) — 'completed' violates it
    // and always failed the query silently from the caller's perspective
    // until markOnboardingComplete()'s own request-context bug (fixed
    // alongside this) got far enough to actually reach this UPDATE.
    const now = new Date().toISOString()
    await execute(db, `
      UPDATE sites
      SET onboarding_status = 'active', updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [now, site.id, site.organization_id])

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('Failed to complete onboarding:', err)
    return jsonResponse({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
})

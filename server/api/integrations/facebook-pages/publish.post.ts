import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookPagesConnection, publishToPage } from '../../../utils/facebook-pages'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { hasEntitlement } from '~/server/utils/billing'

// Publishes a post to the connected Facebook Page on behalf of a site.
export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as {
    siteId?: string
    message?: string
    link?: string
    published?: boolean
  }

  const { message, link, published } = body
  if (!message?.trim()) return jsonResponse({ error: 'message is required' }, { status: 400 })

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  const dashboard = body.siteId ? null : await getDashboardContext(event, { requireRestaurant: false })
  const site = body.siteId && isPlatformAdmin
    ? await db.prepare(`SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1`)
        .bind(body.siteId).first<{ id: string; organization_id: string }>()
    : body.siteId
      ? await db.prepare(`
          SELECT s.id, s.organization_id FROM sites s
          JOIN member om ON s.organization_id = om.organizationId
          WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner','admin')
          LIMIT 1
        `).bind(body.siteId, session.user.id).first<{ id: string; organization_id: string }>()
      : dashboard?.restaurant

  if (!site) return jsonResponse({ error: 'Create a restaurant before publishing to Facebook.' }, { status: 400 })

  const allowed = await hasEntitlement(env, db, site.organization_id, 'managed_service')
  if (!allowed) return jsonResponse({ error: 'Facebook sync is included in the Managed plan and above.' }, { status: 403 })

  const connection = await getFacebookPagesConnection(env, site.organization_id, site.id)
  if (!connection) return jsonResponse({ error: 'No Facebook connection found. Connect Facebook first.' }, { status: 404 })

  if (!connection.facebook_page_id || !connection.encrypted_page_token) {
    return jsonResponse({ error: 'No Facebook Page selected. Sync a page first.' }, { status: 400 })
  }

  try {
    const result = await publishToPage(
      connection.encrypted_page_token,
      connection.facebook_page_id,
      { message, link, published }
    )
    return jsonResponse({ success: true, postId: result.id })
  } catch (err) {
    console.error('Facebook publish failed:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Publish failed' }, { status: 502 })
  }
})

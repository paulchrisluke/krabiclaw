import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookPagesConnection, publishToPage } from '../../../utils/facebook-pages'

// Publishes a post to the connected Facebook Page on behalf of a site.
export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as {
    siteId?: string
    message?: string
    link?: string
    published?: boolean
  }

  const { siteId, message, link, published } = body
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })
  if (!message?.trim()) return jsonResponse({ error: 'message is required' }, { status: 400 })

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  const site = isPlatformAdmin
    ? await db.prepare(`SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1`)
        .bind(siteId).first<{ id: string; organization_id: string }>()
    : await db.prepare(`
        SELECT s.id, s.organization_id FROM sites s
        JOIN member om ON s.organization_id = om.organizationId
        WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner','admin')
        LIMIT 1
      `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const connection = await getFacebookPagesConnection(env, site.organization_id, siteId)
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

import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  getFacebookPagesConnection,
  getFacebookPages,
  getPageInfo,
  getPagePosts,
  syncPageInfoToLocation,
  storeFacebookPagesConnection,
} from '../../../utils/facebook-pages'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { hasEntitlement } from '~/server/utils/billing'

// Syncs page info + recent posts from Facebook into the location record.
// Optionally accepts pageId in the body to switch which page is connected.
export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as {
    siteId?: string
    locationId?: string
    pageId?: string
  }

  const { locationId, pageId } = body
  const dashboard = body.siteId ? null : await getDashboardContext(event, { requireRestaurant: false })
  const site = body.siteId
    ? await db.prepare(`
        SELECT s.id, s.organization_id FROM sites s
        JOIN member om ON s.organization_id = om.organizationId
        WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
        LIMIT 1
      `).bind(body.siteId, session.user.id).first<{ id: string; organization_id: string }>()
    : dashboard?.restaurant

  if (!site) return jsonResponse({ error: 'Create a restaurant before syncing Facebook.' }, { status: 400 })

  const allowed = await hasEntitlement(env, db, site.organization_id, 'managed_service')
  if (!allowed) return jsonResponse({ error: 'Facebook sync is included in the Managed plan and above.' }, { status: 403 })

  const connection = await getFacebookPagesConnection(env, site.organization_id, site.id)
  if (!connection) return jsonResponse({ error: 'No Facebook connection found. Connect Facebook first.' }, { status: 404 })

  try {
    const userToken = connection.encrypted_user_token
    let pageToken = connection.encrypted_page_token
    let targetPageId = pageId ?? connection.facebook_page_id

    // If switching to a different page, fetch fresh page token from /me/accounts
    if (pageId && pageId !== connection.facebook_page_id) {
      const pages = await getFacebookPages(userToken)
      const selected = pages.find(p => p.id === pageId)
      if (!selected) return jsonResponse({ error: 'Page not found in this connection' }, { status: 404 })
      pageToken = selected.access_token
      targetPageId = selected.id

      // Persist the new page selection
      await storeFacebookPagesConnection(env, {
        ...connection,
        facebook_page_id: selected.id,
        facebook_page_name: selected.name,
        encrypted_user_token: userToken,
        encrypted_page_token: pageToken,
        status: 'active',
      })
    }

    if (!pageToken || !targetPageId) {
      return jsonResponse({ error: 'No Facebook Page selected. Use pageId to specify a page.' }, { status: 400 })
    }

    const [pageInfo, posts] = await Promise.all([
      getPageInfo(pageToken, targetPageId),
      getPagePosts(pageToken, targetPageId, 20),
    ])

    if (locationId) {
      await syncPageInfoToLocation(env, pageInfo, connection.id, site.organization_id, site.id, locationId)
    }

    return jsonResponse({
      success: true,
      page: {
        id: pageInfo.id,
        name: pageInfo.name,
        about: pageInfo.about,
        phone: pageInfo.phone,
        website: pageInfo.website,
        location: pageInfo.location,
        fan_count: pageInfo.fan_count,
        cover: pageInfo.cover?.source,
        picture: pageInfo.picture?.data?.url,
      },
      posts: posts.map(p => ({
        id: p.id,
        message: p.message,
        created_time: p.created_time,
        full_picture: p.full_picture,
        permalink_url: p.permalink_url,
      })),
      syncedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Facebook sync failed:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Facebook sync failed' }, { status: 502 })
  }
})

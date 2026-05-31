import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  getFacebookPagesConnection,
  getLinkedInstagramAccount,
  syncInstagramPosts,
  syncFacebookPosts,
} from '~/server/utils/facebook-pages'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : ''
  if (secret) {
    const authorization = getHeader(event, 'authorization') || ''
    if (authorization !== `Bearer ${secret}`) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (!import.meta.dev) {
    return jsonResponse({ error: 'CRON_SECRET is required' }, { status: 500 })
  }

  let body: { limit?: number } = {}
  try {
    const rawBody = await readBody(event)
    if (rawBody && typeof rawBody === 'object') {
      body = rawBody
    }
  } catch (error) {
    return jsonResponse({
      error: 'Invalid JSON request body',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 400 })
  }

  // Validate and clamp limit to sane range
  const DEFAULT_LIMIT = 25
  const MIN_LIMIT = 1
  const MAX_LIMIT = 100
  let limit = DEFAULT_LIMIT
  if (body.limit !== undefined && body.limit !== null) {
    const parsed = parseInt(String(body.limit), 10)
    if (!isNaN(parsed) && parsed >= MIN_LIMIT && parsed <= MAX_LIMIT) {
      limit = parsed
    }
  }

  // Query all sites with active Facebook Pages connections
  const connections = await db.prepare(`
    SELECT organization_id, site_id FROM facebook_pages_connections
    WHERE status = 'active'
  `).all<{ organization_id: string; site_id: string }>()

  if (!connections.results || connections.results.length === 0) {
    return jsonResponse({ success: true, message: 'No active Facebook connections found', results: [] })
  }

  const results: Array<{
    siteId: string
    organizationId: string
    success: number
    errors: number
    skipped: number
    error?: string
  }> = []

  for (const connection of connections.results) {
    try {
      const fbConnection = await getFacebookPagesConnection(env, connection.organization_id, connection.site_id)
      if (!fbConnection || !fbConnection.encrypted_page_token || !fbConnection.facebook_page_id) {
        results.push({
          siteId: connection.site_id,
          organizationId: connection.organization_id,
          success: 0,
          errors: 0,
          skipped: 0,
          error: 'No valid Facebook connection or page selected',
        })
        continue
      }

      // Sync Facebook posts
      let fbResult = { success: 0, errors: 0, skipped: 0 }
      let fbPlatformErrors = 0
      try {
        fbResult = await syncFacebookPosts(
          env,
          connection.organization_id,
          connection.site_id,
          fbConnection.encrypted_page_token,
          fbConnection.facebook_page_id,
          limit
        )
      } catch (fbErr) {
        console.error('Facebook sync failed for site:', connection.site_id, fbErr)
        fbPlatformErrors = 1
      }

      // Sync Instagram posts (if Instagram Business Account is linked)
      let igResult = { success: 0, errors: 0, skipped: 0 }
      let igPlatformErrors = 0
      let igPlatformSkipped = 0
      const igUserId = await getLinkedInstagramAccount(fbConnection.encrypted_page_token, fbConnection.facebook_page_id)
      if (igUserId) {
        try {
          igResult = await syncInstagramPosts(
            env,
            connection.organization_id,
            connection.site_id,
            fbConnection.encrypted_page_token,
            igUserId,
            limit
          )
        } catch (igErr) {
          console.error('Instagram sync failed for site:', connection.site_id, igErr)
          igPlatformErrors = 1
        }
      } else {
        igPlatformSkipped = 1 // No Instagram account linked
      }

      results.push({
        siteId: connection.site_id,
        organizationId: connection.organization_id,
        success: fbResult.success + igResult.success,
        errors: fbResult.errors + igResult.errors + fbPlatformErrors + igPlatformErrors,
        skipped: fbResult.skipped + igResult.skipped + igPlatformSkipped,
        ...(fbPlatformErrors + igPlatformErrors > 0 ? { error: 'Platform-level sync error' } : {}),
      })
    } catch (err) {
      console.error('Social sync failed for site:', connection.site_id, err)
      results.push({
        siteId: connection.site_id,
        organizationId: connection.organization_id,
        success: 0,
        errors: 1,
        skipped: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0)

  return jsonResponse({
    success: true,
    summary: {
      totalSites: results.length,
      totalSuccess,
      totalErrors,
      totalSkipped,
    },
    results,
  })
})

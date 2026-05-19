import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { publishPost } from '~/server/utils/post-management'
import {
  getFacebookPagesConnection,
  publishToPage,
  getLinkedInstagramAccount,
  publishToInstagram,
} from '~/server/utils/facebook-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const postId = getRouterParam(event, 'postId')
  if (!siteId || !postId) return jsonResponse({ error: 'Site ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event)
  const channels: Array<'site' | 'gmb' | 'instagram' | 'facebook'> =
    body?.channels ?? ['site']

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const post = await publishPost(db, site.organization_id, siteId, postId, channels)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  const socialErrors: Record<string, string> = {}
  const now = new Date().toISOString()

  const wantsFacebook = channels.includes('facebook')
  const wantsInstagram = channels.includes('instagram')

  if (wantsFacebook || wantsInstagram) {
    let connection: Awaited<ReturnType<typeof getFacebookPagesConnection>> | null = null
    try {
      connection = await getFacebookPagesConnection(env, site.organization_id, siteId)
    } catch (err) {
      console.error('[publish] getFacebookPagesConnection failed:', err)
      const connErr = 'Facebook connection error'
      if (wantsFacebook) {
        socialErrors.facebook = connErr
        await db.prepare(`UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'facebook'`).bind(connErr, postId).run()
      }
      if (wantsInstagram) {
        socialErrors.instagram = connErr
        await db.prepare(`UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'instagram'`).bind(connErr, postId).run()
      }
    }

    if (!socialErrors.facebook && !socialErrors.instagram) {
      if (!connection?.facebook_page_id || !connection.encrypted_page_token) {
        if (wantsFacebook) {
          socialErrors.facebook = 'No Facebook Page connected'
          await db.prepare(`UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'facebook'`).bind('No Facebook Page connected', postId).run()
        }
        if (wantsInstagram) {
          socialErrors.instagram = 'No Facebook connection (required for Instagram)'
          await db.prepare(`UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`).bind('No Facebook connection (required for Instagram)', postId).run()
        }
      } else {
        const pageToken = connection.encrypted_page_token
        const pageId = connection.facebook_page_id

      // Resolve image URL for Instagram (needs a public HTTPS URL)
      let imageUrl: string | null = null
      if (post.image_asset_id) {
        const asset = await db.prepare(
          `SELECT public_url FROM media_assets WHERE id = ? AND status = 'active' LIMIT 1`
        ).bind(post.image_asset_id).first<{ public_url: string | null }>()
        imageUrl = asset?.public_url ?? null
      }

      // Facebook publish
      if (wantsFacebook) {
        try {
          const fbResult = await publishToPage(pageToken, pageId, { message: post.body })
          await db.prepare(`
            UPDATE post_channel_jobs
            SET status = 'published', provider_post_id = ?, published_at = ?
            WHERE post_id = ? AND channel = 'facebook'
          `).bind(fbResult.id, now, postId).run()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Facebook publish failed'
          socialErrors.facebook = msg
          await db.prepare(`
            UPDATE post_channel_jobs SET status = 'failed', error = ?
            WHERE post_id = ? AND channel = 'facebook'
          `).bind(msg, postId).run()
        }
      }

      // Instagram publish (requires an image)
      if (wantsInstagram) {
        if (!imageUrl) {
          const msg = 'Instagram requires an image — add a photo to this post'
          socialErrors.instagram = msg
          await db.prepare(`
            UPDATE post_channel_jobs SET status = 'skipped', error = ?
            WHERE post_id = ? AND channel = 'instagram'
          `).bind(msg, postId).run()
        } else {
          try {
            const igUserId = await getLinkedInstagramAccount(pageToken, pageId)
            if (!igUserId) {
              const msg = 'No Instagram Business account linked to this Facebook Page'
              socialErrors.instagram = msg
              await db.prepare(`
                UPDATE post_channel_jobs SET status = 'skipped', error = ?
                WHERE post_id = ? AND channel = 'instagram'
              `).bind(msg, postId).run()
            } else {
              const igResult = await publishToInstagram(pageToken, igUserId, {
                caption: post.body,
                imageUrl,
              })
              await db.prepare(`
                UPDATE post_channel_jobs
                SET status = 'published', provider_post_id = ?, published_at = ?
                WHERE post_id = ? AND channel = 'instagram'
              `).bind(igResult.id, now, postId).run()
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Instagram publish failed'
            socialErrors.instagram = msg
            await db.prepare(`
              UPDATE post_channel_jobs SET status = 'failed', error = ?
              WHERE post_id = ? AND channel = 'instagram'
            `).bind(msg, postId).run()
          }
        }
      }
      }
    }
  }

  // Re-fetch post so channel job statuses are current
  const updatedPost = await db.prepare(`
    SELECT p.*, ma.public_url, ma.kind
    FROM posts p
    LEFT JOIN media_assets ma ON p.image_asset_id = ma.id AND ma.status = 'active'
    WHERE p.id = ? AND p.organization_id = ? AND p.site_id = ?
  `).bind(postId, site.organization_id, siteId).first()

  const jobs = await db.prepare(
    `SELECT * FROM post_channel_jobs WHERE post_id = ? ORDER BY channel`
  ).bind(postId).all()

  return jsonResponse({
    success: true,
    post: { ...updatedPost, channels: jobs.results },
    ...(Object.keys(socialErrors).length > 0 ? { socialErrors } : {}),
  })
})

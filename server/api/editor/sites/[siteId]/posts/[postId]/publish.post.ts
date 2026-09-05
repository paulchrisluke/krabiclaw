import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { publishPost, type PostPublishChannel, type PostSocialPublish } from '~/server/utils/post-management'
import { getFacebookPagesConnection } from '~/server/utils/facebook-pages'
import { queryFirst } from '~/server/db'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const postId = getRouterParam(event, 'postId')
  if (!siteId || !postId) return jsonResponse({ error: 'Site ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readRequiredBody<{ channels?: unknown }>(event)
  const channels = parsePublishChannels(body?.channels)
  if (!channels) return jsonResponse({ error: 'channels must be a non-empty array of site, facebook, or instagram' }, { status: 400 })
  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const postScope = await queryFirst<{ location_id: string | null }>(db, `
    SELECT location_id FROM posts
     WHERE id = ? AND organization_id = ? AND site_id = ?
     LIMIT 1
  `, [postId, site.organization_id, siteId])
  if (!postScope) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  await assertResourceAccess(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: postScope.location_id,
  })

  const wantsSocial = channels.includes('facebook') || channels.includes('instagram')
  let socialPublish: PostSocialPublish | null = null
  if (wantsSocial) {
    try {
      const connection = await getFacebookPagesConnection(env, site.organization_id, siteId)
      socialPublish = connection?.facebook_page_id && connection.encrypted_page_token
        ? { kind: 'connected', pageId: connection.facebook_page_id, pageToken: connection.encrypted_page_token }
        : { kind: 'unavailable', reason: 'No Facebook Page connected.' }
    } catch (error) {
      console.error('[publish] getFacebookPagesConnection failed:', error)
      socialPublish = { kind: 'unavailable', reason: 'Facebook connection error.' }
    }
  }

  const post = await publishPost(db, site.organization_id, siteId, postId, channels, env, socialPublish)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  const socialErrors = Object.fromEntries(post.channels
    .filter(job => (job.status === 'failed' || job.status === 'skipped') && job.error)
    .map(job => [job.channel, job.error]))

  return jsonResponse({
    success: true,
    post,
    ...(Object.keys(socialErrors).length > 0 ? { socialErrors } : {}),
  })
})

function parsePublishChannels(value: unknown): PostPublishChannel[] | null {
  const rawChannels = value === undefined ? ['site'] : value
  if (!Array.isArray(rawChannels) || rawChannels.length === 0) return null
  const channels: PostPublishChannel[] = []
  for (const channel of rawChannels) {
    if (channel !== 'site' && channel !== 'facebook' && channel !== 'instagram') return null
    channels.push(channel)
  }
  return [...new Set(channels)]
}

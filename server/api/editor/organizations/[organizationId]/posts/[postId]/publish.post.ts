import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { publishPost, type PostPublishChannel } from '~/server/utils/post-management'
import { queryFirst } from '~/server/db'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const postId = getRouterParam(event, 'postId')
  if (!organizationId || !postId) return jsonResponse({ error: 'Organization ID and Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readRequiredBody<{ channels?: unknown }>(event)
  const channels = parsePublishChannels(body?.channels)
  if (!channels) return jsonResponse({ error: 'channels must be a non-empty array of site, facebook, or instagram' }, { status: 400 })
  const organization = await loadMemberOrganizationRow(event, db, env, organizationId, session.user.id)
  if (!organization) return jsonResponse({ error: 'Organization not found or access denied' }, { status: 404 })

  const postScope = await queryFirst<{ location_id: string | null }>(db, `
    SELECT location_id FROM content_documents
     WHERE kind = 'social_post' AND row_role = 'root' AND id = ? AND organization_id = ?
     LIMIT 1
  `, [postId, organization.id])
  if (!postScope) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  await assertResourceAccess(db, { ...memberAccessPrincipal(organization.membership, { env, event }), resourceLocationId: postScope.location_id })

  const post = await publishPost(db, organization.id, postId, channels, env)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  const socialErrors = Object.fromEntries(post.channels
    .filter(job => channels.includes(job.channel) && (job.status === 'failed' || job.status === 'skipped') && job.error)
    .map(job => [job.channel, job.error]))

  return jsonResponse({
    success: true,
    post,
    ...(Object.keys(socialErrors).length > 0 ? { socialErrors } : {}),
  })
})

function parsePublishChannels(value: unknown): PostPublishChannel[] | null {
  const rawChannels = value === undefined ? ['organization'] : value
  if (!Array.isArray(rawChannels) || rawChannels.length === 0) return null
  const channels: PostPublishChannel[] = []
  for (const channel of rawChannels) {
    if (channel !== 'organization' && channel !== 'facebook' && channel !== 'instagram') return null
    channels.push(channel)
  }
  return [...new Set(channels)]
}

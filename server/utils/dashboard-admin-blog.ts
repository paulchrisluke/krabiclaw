import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  platformPermissionError,
  requirePlatformEventPermission,
} from '~/server/utils/platform-admin-users'
import { getPlatformBlogPost } from '~/server/utils/platform-content'

export async function loadDashboardAdminBlogPost(event: H3Event, postId: string) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  try {
    await requirePlatformEventPermission(event, env, { platform: ['content'] })
  } catch (error) {
    const permission = platformPermissionError(error)
    throw new HTTPError({ statusCode: permission.statusCode, statusMessage: permission.message })
  }
  const post = await getPlatformBlogPost(db, postId)
  if (!post) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
  console.info('[audit]', {
    action: 'admin_read_post',
    timestamp: new Date().toISOString(),
    email: session.user.email,
    postId,
    postSlug: post.slug,
  })
  return { post }
}

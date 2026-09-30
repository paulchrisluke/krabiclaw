import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { HTTPError } from 'nitro'
import type { CloudflareEnv } from '~/server/utils/auth'
import { createPost, deletePost, getPost, listPosts, updatePost, type Post } from '~/server/utils/post-management'
import { PostValidationError } from '~/shared/posts'
import { getSocialConnections, parsePublishTargets, publishPost, reconcilePostPublication } from '~/server/utils/social-publication'
import { listChannelPosts, getChannelPost, deleteChannelPost, parseChannelTarget } from '~/server/utils/social-channel-posts'
import { dashboardOrigin } from '~/server/utils/dashboard-notification-links'
import { findOrganizationById } from '~/server/utils/member-access'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpPageWindow } from '~/server/utils/mcp-pagination'
import { absolutizeOrganizationUrl, attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, omit, optionalString, requiredString } from './shared'

/**
 * The MCP adapter for short posts: it authorizes nothing the domain does not,
 * and serializes the domain's own results. Every rule lives in
 * post-management, social-publication and social-channel-posts, which the dashboard
 * calls too.
 */

async function asMcpValidationError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof PostValidationError) throw mcpProtocolError(MCP_ERROR.invalidParams, error.message)
    throw error
  }
}

/** A draft has the path it will be published at, but no public URL until it is published. */
function forMcp(post: Post, organization: McpExecutorContext['organization']) {
  return {
    ...attachViewUrlToRecord(post, organization, { publicPath: post.status === 'published' ? post.public_path : null }),
    public_path: post.public_path,
    preview_url: absolutizeOrganizationUrl(organization, post.preview_url),
  }
}

export async function handlePostsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  const env = organization.env as CloudflareEnv
  switch (toolName) {
    case 'get_social_connections': {
      const record = await findOrganizationById(env, organization.organizationId)
      if (!record) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
      return await getSocialConnections(env, organization.organizationId, { dashboardBase: dashboardOrigin(env, { orgSlug: record.slug, locationSlug: null }) })
    }
    case 'list_posts': {
      const status = optionalString(args, 'status')
      const locationId = optionalString(args, 'location_id')
      const resource = { resource: `posts:${organization.organizationId}:${status ?? ''}:${locationId ?? ''}` }
      const page = await asMcpValidationError(() => listPosts(organization.db, env, organization.organizationId, { status, locationId },
        mcpPageWindow(args, resource), resource))
      return { posts: page.posts.map(post => forMcp(post, organization)), page_info: page.page_info }
    }
    case 'get_post': {
      const post = await getPost(organization.db, env, organization.organizationId, requiredString(args, 'post_id'))
      if (!post) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
      return { post: forMcp(post, organization) }
    }
    case 'create_post': {
      const { post, replayed } = await asMcpValidationError(() => createPost(organization.db, env, organization.organizationId,
        { post: omit(args, ['organization_id', 'idempotency_key']), idempotencyKey: requiredString(args, 'idempotency_key') }, organization.userId))
      return renderStructuredResponse(
        { ok: true, post: forMcp(post, organization), replayed, context: await mutationContextPayload(organization, { locationId: post.location_id }) },
        replayed ? `This idempotency_key already created the draft post ${post.id}.` : `Created draft post ${post.id}. It is not public until publish_post.`,
      )
    }
    case 'update_post': {
      const post = await asMcpValidationError(() => updatePost(organization.db, env, organization.organizationId, requiredString(args, 'post_id'),
        { changes: omit(args, ['post_id', 'organization_id', 'expected_updated_at']), expectedUpdatedAt: requiredString(args, 'expected_updated_at') }, organization.userId))
      if (!post) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
      return renderStructuredResponse(
        { ok: true, post: forMcp(post, organization), context: await mutationContextPayload(organization, { locationId: post.location_id }) },
        `Updated post ${post.id}.`,
      )
    }
    case 'publish_post': {
      let targets
      try { targets = parsePublishTargets(args.targets) } catch (error) {
        if (error instanceof HTTPError) throw mcpProtocolError(MCP_ERROR.invalidParams, error.message)
        throw error
      }
      const result = await publishPost(env, organization.organizationId, requiredString(args, 'post_id'),
        { expectedUpdatedAt: requiredString(args, 'expected_updated_at'), targets }, organization.userId)
      const summary = result.outcomes.map(outcome => `${outcome.channel}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}`).join('; ')
      return renderStructuredResponse(result as unknown as Record<string, unknown>, `${result.ok ? 'Published' : 'Not every target is published'} — ${summary}.`)
    }
    case 'reconcile_post_publication': {
      return await reconcilePostPublication(env, organization.organizationId, requiredString(args, 'publication_id'), optionalString(args, 'provider_post_id') ?? null)
    }
    case 'list_channel_posts': {
      return await listChannelPosts(env, organization.organizationId, parseChannelTarget(args), {
        after: optionalString(args, 'after') ?? null, limit: args.limit === undefined ? 25 : args.limit as number,
      })
    }
    case 'get_channel_post': {
      return { post: await getChannelPost(env, organization.organizationId, parseChannelTarget(args), requiredString(args, 'provider_post_id')) }
    }
    case 'delete_channel_post': {
      return await deleteChannelPost(env, organization.organizationId, parseChannelTarget(args), requiredString(args, 'provider_post_id'), organization.userId)
    }
    case 'delete_post': {
      const postId = requiredString(args, 'post_id')
      return { post_id: postId, deleted: await deletePost(organization.db, organization.organizationId, postId, organization.userId) }
    }
    default:
      return NOT_HANDLED
  }
}

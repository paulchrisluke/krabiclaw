import { postMutationJsonSchema, PostValidationError } from '~/shared/posts'
import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, postMutationResultObject, postObject, postPublishResultObject, organizationTool } from './shared'
import type { McpExecutorContext } from './execution'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { HTTPError } from 'nitro'
import type { CloudflareEnv } from '~/server/utils/auth'
import { createPost, deletePost, getPost, listPosts, updatePost, type Post } from '~/server/utils/post-management'
import { failureOf, getSocialConnections, parsePublishTargets, publishPost, reconcilePostPublication, SOCIAL_CHANNELS } from '~/server/utils/social-publication'
import { MetaGraphError } from '~/server/utils/meta-graph'
import { DiscordError } from '~/server/utils/discord-webhooks'
import { listChannelPosts, getChannelPost, deleteChannelPost, parseChannelTarget } from '~/server/utils/social-channel-posts'
import { dashboardOrigin } from '~/server/utils/dashboard-notification-links'
import { findOrganizationById } from '~/server/utils/member-access'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpPageWindow } from '~/server/utils/mcp-pagination'
import { absolutizeOrganizationUrl, attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, omit, optionalString, requiredString } from './execution'

const { media: postMediaSchema, ...postUpdateProperties } = postMutationJsonSchema.properties

const publishTargetSchema = {
  anyOf: [
    { type: 'object', additionalProperties: false, properties: { channel: { enum: ['organization'] } }, required: ['channel'], description: 'The organization\'s website.' },
    {
      type: 'object', additionalProperties: false,
      properties: {
        channel: { enum: [...SOCIAL_CHANNELS] },
        target_id: { type: 'string', description: 'The Page, professional account or Discord channel id from get_social_connections.' },
        connection_revision: { type: 'string', description: 'The connection_revision get_social_connections returned with it.' },
      },
      required: ['channel', 'target_id', 'connection_revision'],
    },
  ],
} as const

const socialConnectionObject = {
  type: 'object',
  properties: {
    channel: { type: 'string', enum: [...SOCIAL_CHANNELS] },
    connected: { type: 'boolean' },
    target_id: { type: ['string', 'null'] },
    target_name: { type: ['string', 'null'] },
    connection_revision: { type: ['string', 'null'] },
    supported_formats: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } },
    supported_operations: { type: 'array', items: { type: 'string', enum: ['list', 'read', 'publish', 'delete'] } },
    deletion_unavailable_reason: { type: ['string', 'null'] },
    listing_unavailable_reason: { type: ['string', 'null'], description: 'Why list_channel_posts is not available for this channel.' },
    connect_url: { type: 'string', description: 'Where a person connects or changes this account in the dashboard.' },
  },
  required: ['channel', 'connected', 'target_id', 'target_name', 'connection_revision', 'supported_formats', 'problems', 'supported_operations', 'deletion_unavailable_reason', 'listing_unavailable_reason', 'connect_url'],
}

const channelTargetProperties = {
  channel: { type: 'string', enum: [...SOCIAL_CHANNELS] },
  target_id: { type: 'string', description: 'The exact target_id returned by get_social_connections.' },
  connection_revision: { type: 'string', description: 'The connection_revision returned with that target.' },
} as const
const channelTargetRequired = ['channel', 'target_id', 'connection_revision']
const channelPostObject = {
  type: 'object', additionalProperties: false,
  properties: {
    channel: { type: 'string', enum: [...SOCIAL_CHANNELS] },
    target_id: { type: 'string' },
    provider_post_id: { type: 'string', description: 'Native provider identity, not a website post_id.' },
    body: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'], description: 'The provider link. A Discord message link opens only for members of that channel.' },
    published_at: { type: 'string' },
    media: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      provider_media_id: { type: ['string', 'null'] }, kind: { type: 'string', enum: ['image', 'video'] },
      public_url: { type: ['string', 'null'] }, thumbnail_url: { type: ['string', 'null'] },
    }, required: ['provider_media_id', 'kind', 'public_url', 'thumbnail_url'] } },
  },
  required: ['channel', 'target_id', 'provider_post_id', 'body', 'public_url', 'published_at', 'media'],
}

export const POSTS_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'get_social_connections',
    description: "Read the site’s website, Facebook Page, Instagram and Discord channel publishing connections before selecting a publication target. Returns target_id, connection_revision, supported formats and operations, setup links, and problems, including whether Meta or Discord currently accepts each connection and whether a Discord webhook still posts to the connected channel. Credentials are not returned.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {},
    outputSchema: {
      type: 'object',
      properties: {
        website: { type: 'object', properties: { channel: { type: 'string', enum: ['organization'] }, target_id: { type: 'string' }, label: { type: 'string' } }, required: ['channel', 'target_id', 'label'] },
        channels: { type: 'array', items: socialConnectionObject },
      },
      required: ['website', 'channels'],
    },
  }),
  organizationTool({
    name: 'list_channel_posts',
    description: 'Read live posts directly from the explicitly selected connected Facebook Page or Instagram professional account. Does not import website posts or media. Read get_social_connections first and supply the exact channel, target_id and connection_revision. next_after is Meta\'s cursor; pass it as after for the next page. Discord is not listable: an incoming webhook cannot read channel history; read a Discord message with get_channel_post instead.',
    domain: 'posts', minimumRole: 'admin', confirmRequired: false,
    inputSchema: { ...channelTargetProperties, after: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
    required: channelTargetRequired,
    outputSchema: { type: 'object', properties: { posts: { type: 'array', items: channelPostObject }, next_after: { type: ['string', 'null'] } }, required: ['posts', 'next_after'] },
  }),
  organizationTool({
    name: 'get_channel_post',
    description: "Read one post from the selected connected Facebook Page, Instagram professional account or Discord channel when the user wants its current caption, media or link. Use provider_post_id from list_channel_posts, or for Discord the provider_post_id of a confirmed publication receipt or a message id the connected webhook sent, with the exact target from get_social_connections. Website content is unchanged.",
    domain: 'posts', minimumRole: 'admin', confirmRequired: false,
    inputSchema: { ...channelTargetProperties, provider_post_id: { type: 'string' } },
    required: [...channelTargetRequired, 'provider_post_id'],
    outputSchema: { type: 'object', properties: { post: channelPostObject }, required: ['post'] },
  }),
  organizationTool({
    name: 'delete_channel_post',
    description: 'Permanently delete exactly the provider_post_id on the explicitly selected connected Facebook Page, or a Discord message the connected webhook sent to the connected channel. Keeps the website post and marks its publication receipt removed. Read get_social_connections first, then identify the post with list_channel_posts or, for Discord, a confirmed receipt or verified message id. Instagram deletion is unavailable with this app\'s Instagram Login connection; delete Instagram posts in Instagram. Use delete_post to remove website content separately.',
    domain: 'posts', minimumRole: 'admin', confirmRequired: true,
    inputSchema: { ...channelTargetProperties, provider_post_id: { type: 'string' } },
    required: [...channelTargetRequired, 'provider_post_id'],
    outputSchema: { type: 'object', properties: {
      channel: { type: 'string', enum: ['facebook', 'discord'] }, target_id: { type: 'string' }, provider_post_id: { type: 'string' }, deleted: { type: 'boolean' },
      publication: { type: ['object', 'null'], properties: { id: { type: 'string' }, state: { type: 'string', enum: ['removed'] } }, required: ['id', 'state'] },
    }, required: ['channel', 'target_id', 'provider_post_id', 'deleted', 'publication'] },
  }),
  organizationTool({
    name: 'list_posts',
    description: "List draft or published short website posts when the user wants to find announcements to review or edit. Results are paginated, newest change first. Filter by location_id for one location. Use list_channel_posts for live Facebook or Instagram posts.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      status: { type: 'string', enum: ['draft', 'published'] },
      location_id: { type: 'string', description: 'Only posts scoped to this location.' },
      ...paginationInputSchema,
    },
    outputSchema: {
      type: 'object',
      properties: { posts: { type: 'array', items: postObject }, page_info: pageInfoObject },
      required: ['posts', 'page_info'],
    },
  }),
  organizationTool({
    name: 'get_post',
    description: "Read a short website post before editing or publishing it. Returns its caption, call to action, ordered media, website status, draft preview link and stored Facebook, Instagram or Discord publication receipts. Use get_channel_post for current provider content.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: { type: 'object', properties: { post: postObject }, required: ['post'] },
  }),
  organizationTool({
    name: 'create_post',
    description: "Create a draft short post when the user wants an announcement, event notice or offer. Supports a plain-text caption, ordered media, optional title, location and call to action. It stays private until publish_post. Use a new idempotency_key for each post and reuse it only for retries of that request. Long-form articles use create_blog_post.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      idempotency_key: { type: 'string', minLength: 1, maxLength: 200, description: 'A value you make up once for this post, such as a UUID, and reuse only to retry this same request.' },
      ...postUpdateProperties,
      media: postMediaSchema,
    },
    required: ['idempotency_key'],
    outputSchema: postMutationResultObject,
  }),
  organizationTool({
    name: 'update_post',
    description: 'Change a post\'s title, body, call_to_action, location, visibility or (while a draft) slug. Only the fields sent change. expected_updated_at is the updated_at you last read; a stale one conflicts. Media changes go through set_media, attach_media, remove_media and reorder_media on the post. Words and media cannot change while a Facebook, Instagram or Discord publication of this post is in progress or unresolved. Editing a published post changes the website only; nothing already sent to Facebook, Instagram or Discord is edited.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' }, expected_updated_at: { type: 'string' }, ...postUpdateProperties },
    required: ['post_id', 'expected_updated_at'],
    outputSchema: postMutationResultObject,
  }),
  organizationTool({
    name: 'publish_post',
    description: 'Publish a post to exactly the targets listed, and nowhere else: {"channel":"organization"} for the website, and {"channel":"facebook"|"instagram"|"discord","target_id","connection_revision"} from get_social_connections. Returns one outcome per target; ok is true only when every target is published. Repeating the call returns the existing receipts and never posts twice. processing means Meta is still preparing the media, or Discord rate limited the send: call publish_post again to finish the same post. unknown means the final step was not confirmed: resolve it with reconcile_post_publication, never by publishing again. A post is published once per channel; publish a new post for another Page, account or channel. Facebook takes text, a link, photos or one video; Instagram takes one JPEG image, a carousel of up to ten items, or one video as a Reel, and shows the call to action as text. Discord takes up to 2000 characters of text and call to action, never truncated, with up to ten JPEG, PNG, GIF, WebP, MP4, MOV or WebM attachments of at most 20 MiB each and 25 MiB together; mentions are not pinged; forum and media channels are refused.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      post_id: { type: 'string' },
      expected_updated_at: { type: 'string', description: 'The post\'s updated_at as you last read it.' },
      targets: { type: 'array', minItems: 1, maxItems: 1 + SOCIAL_CHANNELS.length, items: publishTargetSchema, description: 'One entry per destination, each channel at most once.' },
    },
    required: ['post_id', 'expected_updated_at', 'targets'],
    outputSchema: postPublishResultObject,
  }),
  organizationTool({
    name: 'reconcile_post_publication',
    description: "Check an unknown or existing Facebook, Instagram or Discord publication when the user wants to resolve or refresh its outcome. Reads the connected provider and updates the stored publication receipt; it does not publish. Supply provider_post_id only when the exact post is known and belongs to that connected Page, account or channel. Discord cannot be searched: an unknown Discord publication needs the message id, and is resolved only when that message was sent by the connected webhook with this post's exact text and media during the attempt. An unproven outcome remains unknown.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      publication_id: { type: 'string', description: 'The publication id from get_post or a publish_post outcome.' },
      provider_post_id: { type: 'string', description: 'Optional: the Facebook post id, Instagram media id or Discord message id it became. Required for an unknown Discord publication.' },
    },
    required: ['publication_id'],
    outputSchema: {
      type: 'object',
      properties: { state: { type: ['string', 'null'] }, publication: { type: ['object', 'null'] } },
      required: ['state', 'publication'],
    },
  }),
  organizationTool({
    name: 'delete_post',
    description: 'Delete a post from the website. Its Facebook, Instagram and Discord posts are not deleted; use delete_channel_post for an explicit supported channel deletion. Refused while a publication of it is in progress or unresolved.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post_id: { type: 'string' }, deleted: { type: 'boolean' } },
      required: ['post_id', 'deleted'],
    },
  }),
]

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
    case 'list_channel_posts':
    case 'get_channel_post':
    case 'delete_channel_post': {
      try {
        const target = parseChannelTarget(args)
        if (toolName === 'list_channel_posts') {
          return await listChannelPosts(env, organization.organizationId, target, {
            after: optionalString(args, 'after') ?? null, limit: args.limit === undefined ? 25 : args.limit as number,
          })
        }
        if (toolName === 'get_channel_post') {
          return { post: await getChannelPost(env, organization.organizationId, target, requiredString(args, 'provider_post_id')) }
        }
        return await deleteChannelPost(env, organization.organizationId, target, requiredString(args, 'provider_post_id'), organization.userId)
      } catch (error) {
        if (error instanceof HTTPError && error.statusCode === 400) throw mcpProtocolError(MCP_ERROR.invalidParams, error.message)
        // The provider's own refusal, named the way publish_post names it, with
        // the place to reconnect when the connection itself is what failed.
        if (error instanceof MetaGraphError || error instanceof DiscordError) {
          const failure = failureOf(error)
          const channel = typeof args.channel === 'string' ? args.channel : null
          const record = failure.code === 'connection_error' && channel ? await findOrganizationById(env, organization.organizationId) : null
          const reconnect = record ? ` Reconnect ${channel} at ${dashboardOrigin(env, { orgSlug: record.slug, locationSlug: null })}/integrations/${channel}.` : ''
          throw new Error(`${failure.code}: ${failure.message}${reconnect}`, { cause: error })
        }
        throw error
      }
    }
    case 'delete_post': {
      const postId = requiredString(args, 'post_id')
      return { post_id: postId, deleted: await deletePost(organization.db, organization.organizationId, postId, organization.userId) }
    }
    default:
      return NOT_HANDLED
  }
}

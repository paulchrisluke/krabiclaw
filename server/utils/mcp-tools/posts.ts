import { postMutationJsonSchema } from '~/shared/posts'
import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, postMutationResultObject, postObject, postPublishResultObject, organizationTool } from './shared'

const { media: postMediaSchema, ...postUpdateProperties } = postMutationJsonSchema.properties

const publishTargetSchema = {
  anyOf: [
    { type: 'object', additionalProperties: false, properties: { channel: { enum: ['organization'] } }, required: ['channel'], description: 'The organization\'s website.' },
    {
      type: 'object', additionalProperties: false,
      properties: {
        channel: { enum: ['facebook', 'instagram'] },
        target_id: { type: 'string', description: 'The Page or professional account id from get_social_connections.' },
        connection_revision: { type: 'string', description: 'The connection_revision get_social_connections returned with it.' },
      },
      required: ['channel', 'target_id', 'connection_revision'],
    },
  ],
} as const

const socialConnectionObject = {
  type: 'object',
  properties: {
    channel: { type: 'string', enum: ['facebook', 'instagram'] },
    connected: { type: 'boolean' },
    target_id: { type: ['string', 'null'] },
    target_name: { type: ['string', 'null'] },
    connection_revision: { type: ['string', 'null'] },
    supported_formats: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } },
    supported_operations: { type: 'array', items: { type: 'string', enum: ['list', 'read', 'publish', 'delete'] } },
    deletion_unavailable_reason: { type: ['string', 'null'] },
    connect_url: { type: 'string', description: 'Where a person connects or changes this account in the dashboard.' },
  },
  required: ['channel', 'connected', 'target_id', 'target_name', 'connection_revision', 'supported_formats', 'problems', 'supported_operations', 'deletion_unavailable_reason', 'connect_url'],
}

const channelTargetProperties = {
  channel: { type: 'string', enum: ['facebook', 'instagram'] },
  target_id: { type: 'string', description: 'The exact target_id returned by get_social_connections.' },
  connection_revision: { type: 'string', description: 'The connection_revision returned with that target.' },
} as const
const channelTargetRequired = ['channel', 'target_id', 'connection_revision']
const channelPostObject = {
  type: 'object', additionalProperties: false,
  properties: {
    channel: { type: 'string', enum: ['facebook', 'instagram'] },
    target_id: { type: 'string' },
    provider_post_id: { type: 'string', description: 'Native provider identity, not a website post_id.' },
    body: { type: ['string', 'null'] },
    public_url: { type: ['string', 'null'] },
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
    description: "Read the site’s website, Facebook Page and Instagram publishing connections before selecting a publication target. Returns target_id, connection_revision, supported formats and operations, setup links, and problems, including whether Meta currently accepts each connection’s access; a rejected one names Meta’s error code. Credentials are not returned.",
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
    description: 'Read live posts directly from the explicitly selected connected Facebook Page or Instagram professional account. Does not import website posts or media. Read get_social_connections first and supply the exact channel, target_id and connection_revision. next_after is Meta\'s cursor; pass it as after for the next page.',
    domain: 'posts', minimumRole: 'admin', confirmRequired: false,
    inputSchema: { ...channelTargetProperties, after: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
    required: channelTargetRequired,
    outputSchema: { type: 'object', properties: { posts: { type: 'array', items: channelPostObject }, next_after: { type: ['string', 'null'] } }, required: ['posts', 'next_after'] },
  }),
  organizationTool({
    name: 'get_channel_post',
    description: "Read one post from the selected connected Facebook Page or Instagram professional account when the user wants its current caption, media or public link. Use provider_post_id from list_channel_posts and the exact target from get_social_connections. Website content is unchanged.",
    domain: 'posts', minimumRole: 'admin', confirmRequired: false,
    inputSchema: { ...channelTargetProperties, provider_post_id: { type: 'string' } },
    required: [...channelTargetRequired, 'provider_post_id'],
    outputSchema: { type: 'object', properties: { post: channelPostObject }, required: ['post'] },
  }),
  organizationTool({
    name: 'delete_channel_post',
    description: 'Permanently delete exactly the provider_post_id on the explicitly selected connected Facebook Page. Keeps the website post and marks its publication receipt removed. Read get_social_connections and list_channel_posts first. Instagram deletion is unavailable with this app\'s Instagram Login connection; delete Instagram posts in Instagram. Use delete_post to remove website content separately.',
    domain: 'posts', minimumRole: 'admin', confirmRequired: true,
    inputSchema: { ...channelTargetProperties, provider_post_id: { type: 'string' } },
    required: [...channelTargetRequired, 'provider_post_id'],
    outputSchema: { type: 'object', properties: {
      channel: { type: 'string', enum: ['facebook'] }, target_id: { type: 'string' }, provider_post_id: { type: 'string' }, deleted: { type: 'boolean' },
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
    description: "Read a short website post before editing or publishing it. Returns its caption, call to action, ordered media, website status, draft preview link and stored Facebook or Instagram publication receipts. Use get_channel_post for current provider content.",
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
    description: 'Change a post\'s title, body, call_to_action, location, visibility or (while a draft) slug. Only the fields sent change. expected_updated_at is the updated_at you last read; a stale one conflicts. Media changes go through set_media, attach_media, remove_media and reorder_media on the post. Words and media cannot change while a Facebook or Instagram publication of this post is in progress or unresolved. Editing a published post changes the website only; nothing already sent to Facebook or Instagram is edited.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' }, expected_updated_at: { type: 'string' }, ...postUpdateProperties },
    required: ['post_id', 'expected_updated_at'],
    outputSchema: postMutationResultObject,
  }),
  organizationTool({
    name: 'publish_post',
    description: 'Publish a post to exactly the targets listed, and nowhere else: {"channel":"organization"} for the website, and {"channel":"facebook"|"instagram","target_id","connection_revision"} from get_social_connections. Returns one outcome per target; ok is true only when every target is published. Repeating the call returns the existing receipts and never posts twice. processing means Meta is still preparing the media: call publish_post again to finish the same post. unknown means the final step was not confirmed: resolve it with reconcile_post_publication, never by publishing again. A post is published once per channel; publish a new post for another Page or account. Facebook takes text, a link, photos or one video; Instagram takes one JPEG image, a carousel of up to ten items, or one video as a Reel, and shows the call to action as text.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      post_id: { type: 'string' },
      expected_updated_at: { type: 'string', description: 'The post\'s updated_at as you last read it.' },
      targets: { type: 'array', minItems: 1, maxItems: 3, items: publishTargetSchema, description: 'One entry per destination, each channel at most once.' },
    },
    required: ['post_id', 'expected_updated_at', 'targets'],
    outputSchema: postPublishResultObject,
  }),
  organizationTool({
    name: 'reconcile_post_publication',
    description: "Check an unknown or existing Facebook or Instagram publication when the user wants to resolve or refresh its outcome. Reads the connected provider and updates the stored publication receipt; it does not publish. Supply provider_post_id only when the exact post is known and belongs to that connected Page or account. An unproven outcome remains unknown.",
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      publication_id: { type: 'string', description: 'The publication id from get_post or a publish_post outcome.' },
      provider_post_id: { type: 'string', description: 'Optional: the Facebook post id or Instagram media id it became.' },
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
    description: 'Delete a post from the website. Its Facebook and Instagram posts are not deleted; use delete_channel_post for an explicit supported channel deletion. Refused while a publication of it is in progress or unresolved.',
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

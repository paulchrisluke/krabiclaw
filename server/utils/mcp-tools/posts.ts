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
    sync: { type: ['object', 'null'], description: 'Import progress: cursor, last completed scan, last success, last error and any publication it is waiting on.' },
    connect_url: { type: 'string', description: 'Where a person connects or changes this account in the dashboard.' },
  },
  required: ['channel', 'connected', 'target_id', 'target_name', 'connection_revision', 'supported_formats', 'problems', 'sync', 'connect_url'],
}

export const POSTS_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'get_social_connections',
    description: 'Where this organization can publish short posts: its website, and the exact Facebook Page and Instagram professional account it connected, each with the target_id and connection_revision publish_post needs, the formats it takes, anything in the way (plan, disconnected account), its import progress, and the dashboard URL where a person connects it. Never returns a token.',
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
    name: 'list_posts',
    description: 'List short posts, newest change first, a page at a time. Pass location_id for one location\'s posts; omit it for all of them.',
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
    description: 'Get one short post: its words, call to action, ordered media, website status, preview link for a draft, and each Facebook or Instagram publication with its exact state.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: { type: 'object', properties: { post: postObject }, required: ['post'] },
  }),
  organizationTool({
    name: 'create_post',
    description: 'Create a short post as a draft: an optional title, the caption as body (plain text, newlines kept), ordered image or video media, an optional location and an optional call_to_action {label, url}. Nothing is public until publish_post. A draft may be empty; publishing needs words, media or a call to action. Event dates, offers and codes are written in the body. Pass a new idempotency_key per post: repeating a call with the same key returns the same post instead of a second one. Use create_blog_post for long-form articles.',
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
    description: 'Resolve a Facebook or Instagram publication whose outcome is unknown, or refresh one, by reading Meta: it records only what Meta\'s own answer proves, never publishes, and never accepts an assertion that something is published. Pass provider_post_id when you know the exact post it became; it must belong to the connected Page or account. What stays ambiguous stays unknown.',
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
    name: 'sync_social_posts',
    description: 'Read the connected Facebook Page and Instagram account now, as the hourly sync does: new posts become website posts with their media, provider-owned copies take Meta\'s changes, and edited or deleted website copies are left alone. Reports per channel whether the scan completed, what it imported, and any error or publication it is waiting on.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {},
    outputSchema: {
      type: 'object',
      properties: { results: { type: 'array', items: { type: 'object' } } },
      required: ['results'],
    },
  }),
  organizationTool({
    name: 'delete_post',
    description: 'Delete a post from the website. Its Facebook and Instagram posts are not deleted, and a later sync does not bring an imported one back. Refused while a publication of it is in progress or unresolved.',
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

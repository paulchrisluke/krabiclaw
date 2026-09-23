import { instantSchema } from '~/utils/timezone'
import type { McpToolDefinition } from './shared'
import { ROBOTS_DIRECTIVE_ENUM, blogPostMutationResultObject, blogPostObject, blogPostSummaryObject, contentBlockMediaInputObject, contentBlockUpdatedAtInput, pageInfoObject, paginationInputSchema, siteTool } from './shared'
import { PUBLICATION_CONTENT_BLOCK_TYPES, describeContentBlockTextFields } from '~/shared/content-registries'

// A block's place is its index in the array; there is no position to state.
// An image block carries exactly one media item, or it is refused.
const blogContentBlockSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: [...PUBLICATION_CONTENT_BLOCK_TYPES] },
    parent_block_id: { type: ['string', 'null'] },
    level: { type: ['number', 'null'] },
    data: { type: 'object', description: describeContentBlockTextFields(PUBLICATION_CONTENT_BLOCK_TYPES) },
    media: { type: 'array', items: contentBlockMediaInputObject, description: 'Required on image blocks: one item, the picture. A block read back keeps its media by sending it as read.' },
    updated_at: contentBlockUpdatedAtInput,
  },
  required: ['type', 'data'],
  additionalProperties: false,
} as const

export const BLOG_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_blog_posts',
      description: 'List this site\'s draft, published and scheduled blog articles. This is the site\'s own long-form content blog — distinct from list_posts, which is the social-update feed.',
      domain: 'blog',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { status: { type: 'string', enum: ['draft', 'published', 'scheduled'] }, ...paginationInputSchema },
      outputSchema: {
        type: 'object',
        properties: { posts: { type: 'array', items: blogPostSummaryObject }, page_info: pageInfoObject },
        required: ['posts', 'page_info'],
        additionalProperties: false,
      },
    }),
  siteTool({
      name: 'get_blog_post',
      description: 'Get a single blog post by id or slug. Returns the canonical top-level content_blocks array plus one updated_at concurrency token; there is no body, components, or content_document authoring shape.',
      domain: 'blog',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { post_id: { type: 'string', description: 'Post id or slug.' } },
      required: ['post_id'],
      outputSchema: {
        type: 'object',
        properties: {
          post: blogPostObject,
        },
        required: ['post'],
        additionalProperties: false,
      },
    }),
  siteTool({
      name: 'create_blog_post',
      description: 'Create a long-form, evergreen, SEO-indexed article using content_blocks as the only authoring shape. Creation saves a draft by default. Set status to published to publish immediately, or provide a future scheduled_for to schedule it. Compose and review the complete article with the user before calling this tool. category is free text for tenant blogs.',
      domain: 'blog',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: {
        title: { type: 'string' },
        excerpt: { type: 'string' },
        collection: { type: 'string', enum: ['blog', 'docs'], description: "KrabiClaw's own site only: which collection the article belongs to. Every other site has one blog." },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Searchable topical tags. Use a short, deduplicated list; category remains the primary public grouping.' },
        content_blocks: { type: 'array', minItems: 1, description: 'The article, in order. Any number of blocks of any type, images wherever they belong. The first block, when it is an image, is the cover.', items: blogContentBlockSchema },
        seo_title: { type: ['string', 'null'], description: 'Optional SEO/browser-tab title override. Falls back to the post title if unset.' },
        seo_description: { type: 'string' },
        seo_keywords: { type: ['string', 'null'], description: 'Comma-separated SEO keyword phrases when useful.' },
        canonical_url: { type: 'string' },
        visibility: { type: 'string', enum: ['listed', 'unlisted'], description: 'Unlisted posts work by direct URL but are excluded from indexes, search, feeds, and sitemap.' },
        status: { type: 'string', enum: ['draft', 'scheduled', 'published'], description: 'Creation defaults to draft. Scheduled requires a future scheduled_for; published goes live immediately.' },
        scheduled_for: { ...instantSchema, type: ['string', 'null'], description: 'Optional future ISO 8601 datetime with timezone. With no status or schedule, creation saves a draft.' },
      },
      required: ['title', 'content_blocks'],
      outputSchema: blogPostMutationResultObject,
    }),
  siteTool({
      name: 'update_blog_post',
      description: 'Save changes to an existing blog article: metadata, or the whole article body. Only provided fields are changed. content_blocks replaces every block and requires expected_updated_at; to change one block, use append_content_block, replace_content_block or delete_content_block instead. Changes to a live article are public immediately; compose and review them with the user first.',
      domain: 'blog',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        title: { type: 'string' },
        excerpt: { type: 'string' },
        collection: { type: 'string', enum: ['blog', 'docs'], description: "KrabiClaw's own site only: which collection the article belongs to. Every other site has one blog." },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Searchable topical tags. Use a short, deduplicated list; category remains the primary public grouping.' },
        content_blocks: { type: 'array', minItems: 1, description: 'The whole article, in order, replacing every block. Blocks read back keep their id. The first block, when it is an image, is the cover.', items: blogContentBlockSchema },
        expected_updated_at: { type: 'string', description: 'Required with content_blocks. Use updated_at returned by get_blog_post; stale tokens are rejected with a conflict.' },
        seo_title: { type: ['string', 'null'], description: 'Optional SEO/browser-tab title override. Falls back to the post title if unset.' },
        seo_description: { type: 'string' },
        seo_keywords: { type: ['string', 'null'], description: 'Comma-separated SEO keyword phrases when useful.' },
        canonical_url: { type: 'string' },
        visibility: { type: 'string', enum: ['listed', 'unlisted'] },
        slug: { type: ['string', 'null'], description: 'Manual URL slug override. Published slug changes preserve a permanent redirect by default.' },
        redirect_old_slug: { type: 'boolean', description: 'Defaults true after first publish.' },
        reset_slug_override: { type: 'boolean' },
      },
      required: ['post_id'],
      outputSchema: blogPostMutationResultObject,
    }),
  siteTool({
      name: 'publish_blog_post',
      description: 'Publish a draft or scheduled tenant blog article immediately, or reschedule it with scheduled_for. Requires the current document concurrency token. Use only after the writer has approved the final article.',
      domain: 'blog', minimumRole: 'editor', confirmRequired: true,
      inputSchema: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        expected_updated_at: { type: 'string', description: 'Exact post.updated_at concurrency token from the latest get_blog_post or successful blog mutation.' },
        scheduled_for: { ...instantSchema, type: ['string', 'null'], description: 'Optional future ISO 8601 datetime with timezone. Omit or pass null to publish immediately.' },
      },
      required: ['post_id', 'expected_updated_at'],
      outputSchema: blogPostMutationResultObject,
    }),
  siteTool({
      name: 'delete_blog_post',
      description: 'Delete a blog post.',
      domain: 'blog',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: { post_id: { type: 'string', description: 'Post id or slug.' } },
      required: ['post_id'],
      outputSchema: {
        type: 'object',
        properties: { post_id: { type: 'string' }, deleted: { type: 'boolean' } },
        required: ['post_id', 'deleted'],
        additionalProperties: false,
      },
    }),
]

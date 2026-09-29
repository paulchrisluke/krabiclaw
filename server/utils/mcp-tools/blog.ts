import type { McpToolDefinition } from './shared'
import { articleCategoryObject, blogPostMutationResultObject, blogPostObject, blogPostSummaryObject, contentBlockMediaInputObject, contentBlockUpdatedAtInput, pageInfoObject, paginationInputSchema, organizationTool } from './shared'
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

const articleCategoryResult = {
  type: 'object',
  properties: { category: articleCategoryObject },
  required: ['category'],
  additionalProperties: false,
} as const

const articleCategoryListResult = {
  type: 'object',
  properties: { categories: { type: 'array', items: articleCategoryObject } },
  required: ['categories'],
  additionalProperties: false,
} as const

export const BLOG_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'list_blog_posts',
      description: 'List this organization\'s draft and published articles, a page at a time, in the order each collection is read in publicly (sort_order, then newest first). The blog and the documentation are two collections of the same articles; pass collection to list one. This is the organization\'s own long-form content — distinct from list_posts, which is the short-post feed.',
      domain: 'blog',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { status: { type: 'string', enum: ['draft', 'published'] }, collection: { type: 'string', enum: ['blog', 'docs'] }, ...paginationInputSchema },
      outputSchema: {
        type: 'object',
        properties: { posts: { type: 'array', items: blogPostSummaryObject }, page_info: pageInfoObject },
        required: ['posts', 'page_info'],
        additionalProperties: false,
      },
    }),
  organizationTool({
      name: 'get_blog_post',
      description: 'Get a single blog post by id or slug. Returns the canonical top-level content_blocks array plus one updated_at concurrency token; there is no body, components, or content_document authoring shape.',
      domain: 'blog',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'create_blog_post',
      description: 'Create a long-form, evergreen, SEO-indexed article as a draft, using content_blocks as the only authoring shape. It is not public until publish_blog_post; review the draft with its preview_url first. Pass a new idempotency_key per article: repeating a call with the same key returns the same article instead of a second one. Every published article is in one of its collection\'s categories: pass category_id from list_article_categories.',
      domain: 'blog',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: {
        idempotency_key: { type: 'string', minLength: 1, maxLength: 200, description: 'A value you make up once for this article, such as a UUID, and reuse only to retry this same request.' },
        title: { type: 'string' },
        excerpt: { type: 'string' },
        collection: { type: 'string', enum: ['blog', 'docs'], description: "Which of the site's collections the article belongs to: its blog, or its documentation. Defaults to the blog." },
        category_id: { type: 'string', description: "The article's category: the id of one of its collection's categories (list_article_categories). Required before publish_blog_post. To use a category that does not exist yet, create it with create_article_category first." },
        content_blocks: { type: 'array', minItems: 1, description: 'The article, in order. Any number of blocks of any type, images wherever they belong. The first block, when it is an image, is the cover.', items: blogContentBlockSchema },
        seo_keywords: { type: ['string', 'null'], description: 'Comma-separated SEO keyword phrases when useful.' },
        visibility: { type: 'string', enum: ['listed', 'unlisted'], description: 'Unlisted posts work by direct URL but are excluded from indexes, search, feeds, and sitemap.' },
      },
      required: ['idempotency_key', 'title', 'content_blocks'],
      outputSchema: blogPostMutationResultObject,
    }),
  organizationTool({
      name: 'update_blog_post',
      description: 'Save changes to an existing blog article: metadata, or the whole article body. Only provided fields are changed. content_blocks replaces every block and requires expected_updated_at; to change one block, use append_content_block, replace_content_block or delete_content_block instead. Changes to a live article are public immediately; compose and review them with the user first.',
      domain: 'blog',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        title: { type: 'string' },
        excerpt: { type: 'string' },
        collection: { type: 'string', enum: ['blog', 'docs'], description: "Move the article to the site's blog or its documentation. Omit to leave it where it is." },
        category_id: { type: 'string', description: "The article's category: the id of one of its collection's categories (list_article_categories). Required before publish_blog_post. To use a category that does not exist yet, create it with create_article_category first." },
        content_blocks: { type: 'array', minItems: 1, description: 'The whole article, in order, replacing every block. Blocks read back keep their id. The first block, when it is an image, is the cover.', items: blogContentBlockSchema },
        expected_updated_at: { type: 'string', description: 'Required with content_blocks. Use updated_at returned by get_blog_post; stale tokens are rejected with a conflict.' },
        seo_keywords: { type: ['string', 'null'], description: 'Comma-separated SEO keyword phrases when useful.' },
        visibility: { type: 'string', enum: ['listed', 'unlisted'] },
        slug: { type: ['string', 'null'], description: 'Manual URL slug override. Published slug changes preserve a permanent redirect by default.' },
        redirect_old_slug: { type: 'boolean', description: 'Defaults true after first publish.' },
        reset_slug_override: { type: 'boolean' },
      },
      required: ['post_id'],
      outputSchema: blogPostMutationResultObject,
    }),
  organizationTool({
      name: 'publish_blog_post',
      description: 'Publish a draft blog article now. Requires the current document concurrency token. Publishing an article that is already published changes nothing — not its date, not its announcement. Use only after the writer has approved the final article.',
      domain: 'blog', minimumRole: 'admin', confirmRequired: true,
      inputSchema: {
        post_id: { type: 'string', description: 'Post id or slug.' },
        expected_updated_at: { type: 'string', description: 'Exact post.updated_at concurrency token from the latest get_blog_post or successful blog mutation.' },
      },
      required: ['post_id', 'expected_updated_at'],
      outputSchema: blogPostMutationResultObject,
    }),
  organizationTool({
      name: 'reorder_blog_posts',
      description: "Set the order one collection (the blog or the documentation) is read in on the public site, within and across its categories; the categories' own order is reorder_article_categories. Send every article id in that collection exactly once, drafts included, in the intended order; a partial order is rejected. Each article's sort_order is its position from 1; an article written afterwards has sort_order 0 and leads, newest first, until it is placed.",
      domain: 'blog',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        collection: { type: 'string', enum: ['blog', 'docs'] },
        post_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['collection', 'post_ids'],
      outputSchema: {
        type: 'object',
        properties: { posts: { type: 'array', items: blogPostSummaryObject } },
        required: ['posts'],
      },
    }),
  organizationTool({
      name: 'delete_blog_post',
      description: 'Delete a blog post.',
      domain: 'blog',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'list_article_categories',
      description: "List one collection's categories (the blog's or the documentation's) in the order they are read in publicly, with how many articles each holds. Every published article is in exactly one; each category has its own public page at /blog/category/{slug} or /docs/category/{slug}.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: { collection: { type: 'string', enum: ['blog', 'docs'] } },
      required: ['collection'],
      outputSchema: articleCategoryListResult,
    }),
  organizationTool({
      name: 'create_article_category',
      description: 'Create a category in the blog or the documentation. It goes last; place it with reorder_article_categories. Its slug comes from the name and does not change later.',
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        collection: { type: 'string', enum: ['blog', 'docs'] },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 500, description: 'What the category covers, shown on its page and used as the page description.' },
      },
      required: ['collection', 'name'],
      outputSchema: articleCategoryResult,
    }),
  organizationTool({
      name: 'update_article_category',
      description: "Rename a category or change its description. Its page's address (slug) stays the same.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        category_id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 500 },
      },
      required: ['category_id'],
      outputSchema: articleCategoryResult,
    }),
  organizationTool({
      name: 'delete_article_category',
      description: 'Delete an empty category. A category that still has articles is refused with the number it holds: ask the user which category those articles should move to, move each with update_blog_post (category_id), then delete it.',
      domain: 'blog', minimumRole: 'admin', confirmRequired: true,
      inputSchema: { category_id: { type: 'string' } },
      required: ['category_id'],
      outputSchema: {
        type: 'object',
        properties: { category_id: { type: 'string' }, deleted: { type: 'boolean' } },
        required: ['category_id', 'deleted'],
        additionalProperties: false,
      },
    }),
  organizationTool({
      name: 'reorder_article_categories',
      description: "Set the order one collection's categories are read in on the public site: the index, its sidebar and the menu. Send every category id in that collection exactly once; a partial order is rejected.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        collection: { type: 'string', enum: ['blog', 'docs'] },
        category_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['collection', 'category_ids'],
      outputSchema: articleCategoryListResult,
    }),
]

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
      description: "List draft and published long-form articles in the selected site’s blog or documentation collection. Results are paginated in public display order. Short website posts are listed separately by list_posts.",
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
      description: "Read one blog or documentation article by ID or slug, including its ordered content_blocks and updated_at token. Use that token when editing or publishing the article.",
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
      description: "Create a draft blog or documentation article with ordered content_blocks. It stays private until published. A category in the selected collection is required for publication. Use a new idempotency_key for each article; retrying the same key returns the same article. The preview_url allows draft review.",
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
      description: "Edit the selected blog or documentation article. Only supplied metadata changes; content_blocks replaces the entire body and requires expected_updated_at from the latest read. Stale tokens conflict. Changes to a published article are public immediately.",
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
      description: "Publish the selected draft blog or documentation article when publication is requested. Requires expected_updated_at from the latest read. An already published article is unchanged, including its date and announcement.",
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
      description: "Replace the public display order of articles in one blog or documentation collection. Supply every article ID in that collection exactly once, including drafts. New articles with sort_order 0 appear first until ordered; category ordering is separate.",
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
      description: "Permanently delete the selected blog or documentation article and its owned content. Use only when the user requests removing that article; a published article is removed from the website.",
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
      description: "List categories and subcategories in one site blog or documentation collection, in public display order, with article and child-category counts. Published articles require a category in their collection.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: { collection: { type: 'string', enum: ['blog', 'docs'] } },
      required: ['collection'],
      outputSchema: articleCategoryListResult,
    }),
  organizationTool({
      name: 'create_article_category',
      description: 'Create a category in the blog or the documentation, at the top level or under another category (parent_id). It goes last among its siblings; place it with reorder_article_categories. Its slug comes from the name and does not change later.',
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        collection: { type: 'string', enum: ['blog', 'docs'] },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        parent_id: { type: ['string', 'null'], description: 'The category this one sits under, in the same collection; null or omitted for the top level. Categories nest at most 3 levels deep.' },
        description: { type: ['string', 'null'], maxLength: 500, description: 'What the category covers, shown on its page and used as the page description.' },
      },
      required: ['collection', 'name'],
      outputSchema: articleCategoryResult,
    }),
  organizationTool({
      name: 'update_article_category',
      description: "Rename a category, change its description, or move it under another category (parent_id; null moves it to the top level, where it goes last). Its page's address (slug) stays the same.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        category_id: { type: 'string' },
        parent_id: { type: ['string', 'null'], description: 'The category this one sits under, in the same collection; null or omitted for the top level. Categories nest at most 3 levels deep.' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 500 },
      },
      required: ['category_id'],
      outputSchema: articleCategoryResult,
    }),
  organizationTool({
      name: 'delete_article_category',
      description: 'Delete an empty category. A category that still has articles or subcategories is refused with how many it holds: ask the user where they should go, move each article with update_blog_post (category_id) and each subcategory with update_article_category (parent_id), then delete it.',
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
      description: "Set the order of one set of sibling categories on the public site — the index, its sidebar and the menu: the collection's top level (parent_id null or omitted), or one category's subcategories. Send every sibling id exactly once; a partial order is rejected.",
      domain: 'blog', minimumRole: 'admin', confirmRequired: false,
      inputSchema: {
        collection: { type: 'string', enum: ['blog', 'docs'] },
        parent_id: { type: ['string', 'null'], description: 'Whose subcategories are being ordered; null or omitted for the top level.' },
        category_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['collection', 'category_ids'],
      outputSchema: articleCategoryListResult,
    }),
]

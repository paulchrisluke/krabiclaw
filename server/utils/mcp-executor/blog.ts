import type { McpExecutorContext } from './shared'
import { BLOG_UPDATE_MUTATION_FIELDS, createBlogPost, deleteBlogPost, getBlogPost, listBlogPosts, reorderArticles, updateBlogLifecycle, updateBlogPost } from '~/server/utils/content/publishing'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { isArticleCollection, type ArticleCollection } from '~/utils/article-collections'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { mcpPageWindow } from '~/server/utils/mcp-pagination'
import { absolutizeOrganizationUrl, NOT_HANDLED, omit, optionalString, requiredString } from './shared'
import { CONTENT_BLOCK_TYPES } from '~/server/utils/content/documents'
import { createArticleCategory, deleteArticleCategory, listArticleCategories, reorderArticleCategories, updateArticleCategory, type ArticleCategory } from '~/server/utils/content/article-categories'

const ARTICLE_COLLECTIONS_SET = new Set(['blog', 'docs'])

function optionalArticleCollection(args: Record<string, unknown>): ArticleCollection | null {
  if (args.collection === undefined || args.collection === null) return null
  if (!isArticleCollection(args.collection)) throw mcpProtocolError(MCP_ERROR.invalidParams, 'collection must be blog or docs.')
  return args.collection
}

const BLOG_CONTENT_BLOCK_TYPES = new Set<string>(CONTENT_BLOCK_TYPES)

const BLOG_POST_STATUSES = new Set(['draft', 'published'])
const BLOG_VISIBILITIES = new Set(['listed', 'unlisted'])

function hasAnyField(args: Record<string, unknown>, fields: readonly string[]) {
  return fields.some(field => Object.prototype.hasOwnProperty.call(args, field))
}

function requireAtLeastOneField(args: Record<string, unknown>, fields: readonly string[], message: string) {
  if (!hasAnyField(args, fields)) throw mcpProtocolError(MCP_ERROR.invalidParams, message)
}

function invalidBlogResponse(path: string, expected: string): never {
  throw mcpProtocolError(MCP_ERROR.internal, `Blog service returned invalid ${path}; expected ${expected}.`)
}

function responseRecord(value: unknown, path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidBlogResponse(path, 'an object')
  return value as Record<string, unknown>
}

function responseString(value: unknown, path: string) {
  if (typeof value !== 'string' || !value) invalidBlogResponse(path, 'a non-empty string')
  return value
}

function responseEnumString(value: unknown, path: string, allowed: Set<string>) {
  const result = responseString(value, path)
  if (!allowed.has(result)) invalidBlogResponse(path, `one of ${[...allowed].join(', ')}`)
  return result
}

function responseNullableString(value: unknown, path: string) {
  if (value === null) return null
  if (typeof value !== 'string') invalidBlogResponse(path, 'a string or null')
  return value
}

function responseNullableNumber(value: unknown, path: string) {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidBlogResponse(path, 'a finite number or null')
  return value
}

function responseInteger(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalidBlogResponse(path, 'an integer')
  return value
}

function responseBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') invalidBlogResponse(path, 'a boolean')
  return value
}

function toMedia(value: unknown) {
  if (!Array.isArray(value)) invalidBlogResponse('post.media', 'an array')
  return value.map((item, index) => {
    const path = `post.media[${index}]`
    const media = responseRecord(item, path)
    return {
      asset_id: responseString(media.asset_id, `${path}.asset_id`),
      slot: responseString(media.slot, `${path}.slot`),
      public_url: responseNullableString(media.public_url, `${path}.public_url`),
      kind: responseNullableString(media.kind, `${path}.kind`),
      width: responseNullableNumber(media.width, `${path}.width`),
      height: responseNullableNumber(media.height, `${path}.height`),
    }
  })
}

function toCover(value: unknown) {
  if (value === null || value === undefined) return null
  const cover = responseRecord(value, 'post.cover')
  return {
    asset_id: responseString(cover.asset_id, 'post.cover.asset_id'),
    public_url: responseNullableString(cover.public_url, 'post.cover.public_url'),
    thumbnail_url: responseNullableString(cover.thumbnail_url, 'post.cover.thumbnail_url'),
    kind: responseNullableString(cover.kind, 'post.cover.kind'),
    alt_text: responseNullableString(cover.alt_text, 'post.cover.alt_text'),
    width: responseNullableNumber(cover.width, 'post.cover.width'),
    height: responseNullableNumber(cover.height, 'post.cover.height'),
  }
}

function toContentBlockProjection(value: unknown, index: number) {
  const path = `post.content_document.blocks[${index}]`
  const block = responseRecord(value, path)
  const data = responseRecord(block.data, `${path}.data`)
  return {
    id: responseString(block.id, `${path}.id`),
    parent_block_id: responseNullableString(block.parent_block_id, `${path}.parent_block_id`),
    type: responseEnumString(block.type, `${path}.type`, BLOG_CONTENT_BLOCK_TYPES),
    level: responseNullableNumber(block.level, `${path}.level`),
    data,
    media: toMedia(block.media),
    updated_at: responseString(block.updated_at, `${path}.updated_at`),
  }
}

function toCategoryRef(value: unknown) {
  if (value === null) return null
  const category = responseRecord(value, 'post.category')
  return { id: responseString(category.id, 'post.category.id'), name: responseString(category.name, 'post.category.name'), slug: responseString(category.slug, 'post.category.slug') }
}

function toArticleCategory(category: ArticleCategory) {
  return { id: category.id, collection: category.collection, name: category.name, slug: category.slug,
    description: category.description, parent_id: category.parent_id, sort_order: category.sort_order,
    article_count: category.article_count, child_count: category.child_count }
}

function requiredArticleCollection(args: Record<string, unknown>): ArticleCollection {
  const collection = optionalArticleCollection(args)
  if (!collection) throw mcpProtocolError(MCP_ERROR.invalidParams, 'collection is required.')
  return collection
}

function toBlogPostSummary(post: Record<string, unknown>, organization: McpExecutorContext['organization']) {
  const publicUrl = absolutizeOrganizationUrl(organization, responseNullableString(post.public_url, 'post.public_url'))
  return {
    id: responseString(post.id, 'post.id'),
    title: responseString(post.title, 'post.title'),
    slug: responseString(post.slug, 'post.slug'),
    excerpt: responseNullableString(post.excerpt, 'post.excerpt'),
    collection: responseEnumString(post.collection ?? 'blog', 'post.collection', ARTICLE_COLLECTIONS_SET),
    category: toCategoryRef(post.category),
    sort_order: responseInteger(post.sort_order, 'post.sort_order'),
    seo_keywords: responseNullableString(post.seo_keywords, 'post.seo_keywords'),
    published: responseBoolean(post.published, 'post.published'),
    published_at: responseNullableString(post.published_at, 'post.published_at'),
    status: responseEnumString(post.status, 'post.status', BLOG_POST_STATUSES),
    visibility: responseEnumString(post.visibility, 'post.visibility', BLOG_VISIBILITIES),
    created_at: responseString(post.created_at, 'post.created_at'),
    updated_at: responseString(post.updated_at, 'post.updated_at'),
    cover: toCover(post.cover),
    admin_edit_url: responseNullableString(post.admin_edit_url, 'post.admin_edit_url'),
    edit_url: responseNullableString(post.edit_url, 'post.edit_url'),
    public_path: responseNullableString(post.public_path, 'post.public_path'),
    public_url: publicUrl,
    preview_url: absolutizeOrganizationUrl(organization, responseNullableString(post.preview_url, 'post.preview_url')),
    view_url: publicUrl,
  }
}

export function projectBlogPostForMcp(post: Record<string, unknown>, organization: McpExecutorContext['organization']) {
  const contentDocument = responseRecord(post.content_document, 'post.content_document')
  if (!Array.isArray(contentDocument.blocks)) invalidBlogResponse('post.content_document.blocks', 'an array')
  return {
    ...toBlogPostSummary(post, organization),
    content_blocks: contentDocument.blocks.map((block, index) => toContentBlockProjection(block, index)),
  }
}

export async function handleBlogTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_blog_posts":
      {
        const status = optionalString(args, "status");
        const collection = optionalArticleCollection(args);
        const resource = { resource: `blog-posts:${organization.organizationId}:${status ?? ''}:${collection ?? ''}` };
        const page = await listBlogPosts(organization.db, organization.organizationId, status, organization.env, mcpPageWindow(args, resource), resource, collection);
        return { posts: page.posts.map((post) => toBlogPostSummary(post, organization)), page_info: page.page_info };
      }
    case "get_blog_post":
      {
        const post = await getBlogPost(
          organization.db,
          requiredString(args, "post_id"),
          organization.organizationId,
          organization.env,
        );
        return {
          post: projectBlogPostForMcp(post, organization),
        };
      }
    case "create_blog_post": {
      const result = await createBlogPost(
        organization.db,
        organization.userId,
        args as never,
        { organization_id: organization.organizationId, },
        organization.env,
      );
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(result.post, organization) },
        `Created draft blog article "${result.post.title ?? result.post.id}". It is not public until publish_blog_post.`,
      );
    }
    case "update_blog_post": {
      requireAtLeastOneField(args, BLOG_UPDATE_MUTATION_FIELDS, "At least one blog mutation field is required.")
      const result = await updateBlogPost(
        organization.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id", "organization_id"]) as never,
        organization.organizationId,
        organization.env,
      );
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(result.post, organization) },
        `Saved changes to blog article "${result.post.title ?? result.post.id}".`,
      );
    }
    case "publish_blog_post": {
      const postId = requiredString(args, "post_id")
      const lifecycle = await updateBlogLifecycle(organization.db, postId, {
        expected_updated_at: requiredString(args, 'expected_updated_at'),
      }, organization.organizationId)
      const result = await getBlogPost(organization.db, postId, organization.organizationId, organization.env)
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(result, organization) },
        lifecycle.changed ? `Published blog article "${result.title}".` : `Blog article "${result.title}" was already published; nothing changed.`,
      )
    }
    case "reorder_blog_posts": {
      const collection = requiredArticleCollection(args)
      if (!Array.isArray(args.post_ids) || args.post_ids.some(id => typeof id !== 'string' || !id.trim())) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'post_ids must contain non-empty post ids.')
      }
      await reorderArticles(organization.db, organization.organizationId, collection, args.post_ids.map(id => String(id).trim()))
      // The order that was set, read back whole: every article in the collection, in it.
      const posts: Awaited<ReturnType<typeof listBlogPosts>>['posts'] = []
      const resource = { resource: `article-order:${organization.organizationId}:${collection}` }
      for (let offset = 0, more = true; more; offset += 100) {
        const page = await listBlogPosts(organization.db, organization.organizationId, null, organization.env, { limit: 100, offset }, resource, collection)
        posts.push(...page.posts)
        more = page.page_info.has_more
      }
      return { posts: posts.map(post => toBlogPostSummary(post, organization)) }
    }
    case "list_article_categories": {
      const categories = await listArticleCategories(organization.db, organization.organizationId, requiredArticleCollection(args))
      return { categories: categories.map(toArticleCategory) }
    }
    case "create_article_category": {
      const category = await createArticleCategory(organization.db, { organizationId: organization.organizationId,
        collection: requiredArticleCollection(args), name: args.name, description: args.description, parentId: args.parent_id, actorId: organization.userId })
      return renderStructuredResponse({ category: toArticleCategory(category) }, `Created ${category.collection} category "${category.name}".`)
    }
    case "update_article_category": {
      const category = await updateArticleCategory(organization.db, { organizationId: organization.organizationId,
        categoryId: requiredString(args, 'category_id'), name: args.name, description: args.description, parentId: args.parent_id, actorId: organization.userId })
      return renderStructuredResponse({ category: toArticleCategory(category) }, `Saved category "${category.name}".`)
    }
    case "delete_article_category": {
      const categoryId = requiredString(args, 'category_id')
      await deleteArticleCategory(organization.db, { organizationId: organization.organizationId, categoryId })
      return { category_id: categoryId, deleted: true }
    }
    case "reorder_article_categories": {
      const categories = await reorderArticleCategories(organization.db, { organizationId: organization.organizationId,
        collection: requiredArticleCollection(args), parentId: args.parent_id, categoryIds: args.category_ids, actorId: organization.userId })
      return { categories: categories.map(toArticleCategory) }
    }
    case "delete_blog_post": {
      const postId = requiredString(args, "post_id");
      await deleteBlogPost(organization.db, postId, organization.organizationId);
      return { post_id: postId, deleted: true };
    }
    default:
      return NOT_HANDLED
  }
}

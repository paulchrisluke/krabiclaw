import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, reorderPlatformBlogPosts, updatePlatformBlogLifecycle, updatePlatformBlogPost } from '~/server/utils/platform-content'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { attachViewUrlToRecord, NOT_HANDLED, objectArray, omit, optionalString, requiredString } from './shared'

const UPDATE_BLOG_MUTATION_FIELDS = [
  'title',
  'excerpt',
  'category',
  'tags',
  'content_blocks',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
  'visibility',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
]

const BLOG_METADATA_FIELDS = [
  'title',
  'excerpt',
  'category',
  'tags',
  'nav_section',
  'nav_title',
  'nav_order',
  'nav_section_order',
  'hide_from_nav',
  'featured_order',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'canonical_url',
  'robots',
  'visibility',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
]

const BLOG_CONTENT_BLOCK_TYPES = new Set([
  'heading',
  'markdown',
  'image',
  'gallery',
  'faq',
  'how_to',
  'divider',
  'ai_assistance',
  'cta',
  'callout',
])

const BLOG_POST_STATUSES = new Set(['published', 'scheduled'])
const BLOG_VISIBILITIES = new Set(['public', 'unlisted'])

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

function responseNumber(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidBlogResponse(path, 'a finite number')
  return value
}

function responseBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') invalidBlogResponse(path, 'a boolean')
  return value
}

function responseStringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    invalidBlogResponse(path, 'an array of strings')
  }
  return value as string[]
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

function toContentBlockProjection(value: unknown, index: number) {
  const path = `post.content_document.blocks[${index}]`
  const block = responseRecord(value, path)
  const data = responseRecord(block.data, `${path}.data`)
  return {
    id: responseString(block.id, `${path}.id`),
    parent_block_id: responseNullableString(block.parent_block_id, `${path}.parent_block_id`),
    type: responseEnumString(block.type, `${path}.type`, BLOG_CONTENT_BLOCK_TYPES),
    position: responseNumber(block.position, `${path}.position`),
    level: responseNullableNumber(block.level, `${path}.level`),
    data,
    media: toMedia(block.media),
  }
}

function toBlogPostSummary(post: Record<string, unknown>) {
  return {
    id: responseString(post.id, 'post.id'),
    title: responseString(post.title, 'post.title'),
    slug: responseString(post.slug, 'post.slug'),
    excerpt: responseNullableString(post.excerpt, 'post.excerpt'),
    category: responseNullableString(post.category, 'post.category'),
    tags: responseStringArray(post.tags, 'post.tags'),
    nav_section: responseNullableString(post.nav_section, 'post.nav_section'),
    nav_title: responseNullableString(post.nav_title, 'post.nav_title'),
    nav_order: responseNullableNumber(post.nav_order, 'post.nav_order'),
    nav_section_order: responseNullableNumber(post.nav_section_order, 'post.nav_section_order'),
    hide_from_nav: responseBoolean(post.hide_from_nav, 'post.hide_from_nav'),
    featured_order: responseNullableNumber(post.featured_order, 'post.featured_order'),
    seo_title: responseNullableString(post.seo_title, 'post.seo_title'),
    seo_description: responseNullableString(post.seo_description, 'post.seo_description'),
    seo_keywords: responseNullableString(post.seo_keywords, 'post.seo_keywords'),
    canonical_url: responseNullableString(post.canonical_url, 'post.canonical_url'),
    robots: responseNullableString(post.robots, 'post.robots'),
    published: responseBoolean(post.published, 'post.published'),
    published_at: responseNullableString(post.published_at, 'post.published_at'),
    status: responseEnumString(post.status, 'post.status', BLOG_POST_STATUSES),
    visibility: responseEnumString(post.visibility, 'post.visibility', BLOG_VISIBILITIES),
    scheduled_for: responseNullableString(post.scheduled_for, 'post.scheduled_for'),
    created_at: responseString(post.created_at, 'post.created_at'),
    updated_at: responseString(post.updated_at, 'post.updated_at'),
    media: toMedia(post.media),
    admin_edit_url: responseNullableString(post.admin_edit_url, 'post.admin_edit_url'),
    edit_url: responseNullableString(post.edit_url, 'post.edit_url'),
    public_path: responseNullableString(post.public_path, 'post.public_path'),
    public_url: responseNullableString(post.public_url, 'post.public_url'),
    preview_url: responseNullableString(post.preview_url, 'post.preview_url'),
    view_url: responseNullableString(post.view_url, 'post.view_url'),
  }
}

export function projectBlogPostForMcp(post: Record<string, unknown>) {
  const contentDocument = responseRecord(post.content_document, 'post.content_document')
  const document = responseRecord(contentDocument.document, 'post.content_document.document')
  if (!Array.isArray(contentDocument.blocks)) invalidBlogResponse('post.content_document.blocks', 'an array')
  return {
    ...toBlogPostSummary(post),
    content_blocks: contentDocument.blocks.map((block, index) => toContentBlockProjection(block, index)),
    document_updated_at: responseString(document.updated_at, 'post.content_document.document.updated_at'),
  }
}

function blogPostResponse(post: Record<string, unknown>, site: McpExecutorContext['site'], message: string) {
  const hydrated = attachViewUrlToRecord(post, site, {}, site.env)
  return renderStructuredResponse(
    { post: projectBlogPostForMcp(hydrated) },
    message,
  )
}

export async function handleBlogTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_blog_posts":
      {
        const posts = (await listPlatformBlogPosts(
          site.db,
          optionalString(args, "status"),
          site.siteId,
          site.env,
        )).map((post) => toBlogPostSummary(attachViewUrlToRecord(post, site, {}, site.env)));
        const { items, page_info } = paginateMcpCollection(posts, args, { resource: `blog-posts:${site.siteId}` });
        return { posts: items, page_info };
      }
    case "get_blog_post":
      {
        const post = await getPlatformBlogPost(
          site.db,
          requiredString(args, "post_id"),
          site.siteId,
          site.env,
        );
        return {
          post: projectBlogPostForMcp(attachViewUrlToRecord(post, site, {}, site.env)),
        };
      }
    case "create_blog_post": {
      const result = await createPlatformBlogPost(
        site.db,
        site.userId,
        args as never,
        { site_id: site.siteId, organization_id: site.organizationId },
        site.env,
      );
      const hydratedBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(hydratedBlogPost) },
        `${result.post.status === 'scheduled' ? 'Scheduled' : 'Published'} blog article "${result.post.title ?? result.post.id}".`,
      );
    }
    case "update_blog_post": {
      requireAtLeastOneField(args, UPDATE_BLOG_MUTATION_FIELDS, "At least one blog mutation field is required.")
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id", "site_id"]) as never,
        site.siteId,
        site.env,
      );
      const hydratedUpdatedBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(hydratedUpdatedBlogPost) },
        `Saved changes to blog article "${result.post.title ?? result.post.id}".`,
      );
    }
    case "update_blog_metadata": {
      requireAtLeastOneField(args, BLOG_METADATA_FIELDS, "At least one blog metadata field is required.")
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id", "site_id"]) as never,
        site.siteId,
        site.env,
      )
      return blogPostResponse(
        result.post,
        site,
        `Updated blog post metadata for "${result.post.title ?? result.post.id}".`,
      )
    }
    case "replace_blog_content": {
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        {
          content_blocks: args.content_blocks,
          expected_document_updated_at: requiredString(args, "expected_document_updated_at"),
        } as never,
        site.siteId,
        site.env,
      )
      return blogPostResponse(
        result.post,
        site,
        `Saved live content changes for blog article "${result.post.title ?? result.post.id}".`,
      )
    }
    case "publish_blog_post": {
      const postId = requiredString(args, "post_id")
      const scheduledFor = args.scheduled_for
      if (Object.prototype.hasOwnProperty.call(args, 'scheduled_for')
        && scheduledFor !== null
        && (typeof scheduledFor !== 'string' || !scheduledFor.trim())) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'Invalid scheduled_for')
      }
      const normalizedScheduledFor = typeof scheduledFor === 'string' ? scheduledFor.trim() : scheduledFor
      await updatePlatformBlogLifecycle(site.db, postId, {
        expected_updated_at: requiredString(args, 'expected_updated_at'),
        expected_document_updated_at: requiredString(args, 'expected_document_updated_at'),
        ...(Object.prototype.hasOwnProperty.call(args, 'scheduled_for')
          ? { scheduled_for: normalizedScheduledFor as string | null }
          : {}),
      }, site.siteId)
      const result = await getPlatformBlogPost(site.db, postId, site.siteId, site.env)
      const post = attachViewUrlToRecord(result, site, {}, site.env)
      return renderStructuredResponse(
        { post: projectBlogPostForMcp(post) },
        `${result.status === 'scheduled' ? 'Rescheduled' : 'Published'} blog article "${result.title}".`,
      )
    }
    case "reorder_blog_posts": {
      const items = objectArray(args.items, "items").map((item) => {
        const navOrder = item.nav_order
        if (typeof navOrder !== "number" || !Number.isInteger(navOrder)) {
          throw mcpProtocolError(MCP_ERROR.invalidParams, "Each item must have an integer nav_order.")
        }
        const result: Record<string, string | number | boolean | null> = {
          post_id: requiredString(item, "post_id"),
          nav_order: navOrder,
        }
        if (Object.prototype.hasOwnProperty.call(item, "nav_section")) {
          const value = item.nav_section
          if (value !== null && typeof value !== "string") {
            throw mcpProtocolError(MCP_ERROR.invalidParams, "nav_section must be a string or null when provided.")
          }
          result.nav_section = value ?? null
        }
        if (Object.prototype.hasOwnProperty.call(item, "nav_title")) {
          const value = item.nav_title
          if (value !== null && typeof value !== "string") {
            throw mcpProtocolError(MCP_ERROR.invalidParams, "nav_title must be a string or null when provided.")
          }
          result.nav_title = value ?? null
        }
        if (Object.prototype.hasOwnProperty.call(item, "nav_section_order")) {
          const value = item.nav_section_order
          if (value !== null && (typeof value !== "number" || !Number.isInteger(value))) {
            throw mcpProtocolError(MCP_ERROR.invalidParams, "nav_section_order must be an integer or null when provided.")
          }
          result.nav_section_order = value ?? null
        }
        if (Object.prototype.hasOwnProperty.call(item, "hide_from_nav")) {
          const value = item.hide_from_nav
          if (value !== null && typeof value !== "boolean") {
            throw mcpProtocolError(MCP_ERROR.invalidParams, "hide_from_nav must be a boolean or null when provided.")
          }
          result.hide_from_nav = value === null ? null : Boolean(value)
        }
        return result as { post_id: string; nav_section?: string | null; nav_title?: string | null; nav_order: number; nav_section_order?: number | null; hide_from_nav?: boolean | null }
      })
      const result = await reorderPlatformBlogPosts(site.db, items, site.siteId, site.env)
      return {
        success: result.success,
        posts: result.posts.map((post) => toBlogPostSummary(attachViewUrlToRecord(post, site, {}, site.env))),
      }
    }
    case "delete_blog_post": {
      const postId = requiredString(args, "post_id");
      await deletePlatformBlogPost(site.db, postId, site.siteId);
      return { post_id: postId, deleted: true };
    }
    default:
      return NOT_HANDLED
  }
}

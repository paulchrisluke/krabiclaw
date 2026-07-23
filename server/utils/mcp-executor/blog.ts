import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, reorderPlatformBlogPosts, updatePlatformBlogPost } from '~/server/utils/platform-content'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { attachViewUrlToRecord, NOT_HANDLED, objectArray, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

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
  'scheduled_for',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
  'publish',
  'unpublish',
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
  'scheduled_for',
  'slug',
  'redirect_old_slug',
  'reset_slug_override',
]

function hasAnyField(args: Record<string, unknown>, fields: readonly string[]) {
  return fields.some(field => Object.prototype.hasOwnProperty.call(args, field))
}

function requireAtLeastOneField(args: Record<string, unknown>, fields: readonly string[], message: string) {
  if (!hasAnyField(args, fields)) throw mcpProtocolError(MCP_ERROR.invalidParams, message)
}

function toNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function toNullableNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function toNullableBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function toFeaturedImage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const image = value as Record<string, unknown>
  return {
    asset_id: toNullableString(image.asset_id),
    public_url: toNullableString(image.public_url),
    kind: toNullableString(image.kind),
    width: toNullableNumber(image.width),
    height: toNullableNumber(image.height),
  }
}

function toContentBlockProjection(value: unknown, fallbackPosition: number) {
  const block = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    id: String(block.id ?? ''),
    parent_block_id: toNullableString(block.parent_block_id),
    type: String(block.type ?? 'markdown'),
    position: typeof block.position === 'number' ? block.position : fallbackPosition,
    level: toNullableNumber(block.level),
    data: block.data && typeof block.data === 'object' && !Array.isArray(block.data)
      ? block.data as Record<string, unknown>
      : {},
  }
}

function toBlogPostProjection(post: Record<string, unknown>) {
  const contentDocument = post.content_document as { document?: { updated_at?: unknown }; blocks?: unknown } | null | undefined
  const contentBlocks = Array.isArray(contentDocument?.blocks)
    ? contentDocument.blocks
    : Array.isArray(post.content_blocks)
      ? post.content_blocks
      : []
  return {
    id: String(post.id ?? ''),
    title: String(post.title ?? ''),
    slug: String(post.slug ?? ''),
    excerpt: toNullableString(post.excerpt),
    category: toNullableString(post.category),
    tags: Array.isArray(post.tags) ? post.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    nav_section: toNullableString(post.nav_section),
    nav_title: toNullableString(post.nav_title),
    nav_order: toNullableNumber(post.nav_order),
    nav_section_order: toNullableNumber(post.nav_section_order),
    hide_from_nav: toNullableBoolean(post.hide_from_nav) ?? false,
    featured_order: toNullableNumber(post.featured_order),
    seo_title: toNullableString(post.seo_title),
    seo_description: toNullableString(post.seo_description),
    seo_keywords: toNullableString(post.seo_keywords),
    canonical_url: toNullableString(post.canonical_url),
    robots: toNullableString(post.robots),
    author_name: toNullableString(post.author_name),
    published: Boolean(post.published),
    published_at: toNullableString(post.published_at),
    status: String(post.status ?? 'draft'),
    visibility: String(post.visibility ?? 'public'),
    scheduled_for: toNullableString(post.scheduled_for),
    created_at: String(post.created_at ?? ''),
    updated_at: String(post.updated_at ?? ''),
    featured_image: toFeaturedImage(post.featured_image),
    admin_edit_url: toNullableString(post.admin_edit_url),
    edit_url: toNullableString(post.edit_url),
    public_path: toNullableString(post.public_path),
    public_url: toNullableString(post.public_url),
    preview_url: toNullableString(post.preview_url),
    view_url: toNullableString(post.view_url),
    content_blocks: contentBlocks.map((block, index) => toContentBlockProjection(block, index)),
    document_updated_at: toNullableString(contentDocument?.document?.updated_at),
  }
}

function toBlogPostSummary(post: Record<string, unknown>) {
  const projected = toBlogPostProjection(post)
  const { author_name: _authorName, content_blocks: _contentBlocks, document_updated_at: _documentUpdatedAt, ...summary } = projected
  return summary
}

function blogPostResponse(post: Record<string, unknown>, site: McpExecutorContext['site'], message: string) {
  const hydrated = attachViewUrlToRecord(post, site, {}, site.env)
  return renderStructuredResponse(
    { post: toBlogPostProjection(hydrated) },
    message,
  )
}

export async function handleBlogTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_blog_posts":
      return {
        posts: (await listPlatformBlogPosts(
          site.db,
          optionalString(args, "status") ?? undefined,
          site.siteId,
        )).map((post) => toBlogPostSummary(attachViewUrlToRecord(post, site, {}, site.env))),
      };
    case "get_blog_post":
      {
        const post = await getPlatformBlogPost(
          site.db,
          requiredString(args, "post_id"),
          site.siteId,
        );
        return {
          post: toBlogPostProjection(attachViewUrlToRecord(post, site, {}, site.env)),
        };
      }
    case "create_blog_post": {
      const result = await createPlatformBlogPost(
        site.db,
        site.userId,
        args as never,
        { site_id: site.siteId, organization_id: site.organizationId },
      );
      const hydratedBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse(
        { post: toBlogPostProjection(hydratedBlogPost) },
        `Created blog post "${result.post.title ?? result.post.id}". Please review the draft at edit_url before publishing.`,
      );
    }
    case "update_blog_post": {
      requireAtLeastOneField(args, UPDATE_BLOG_MUTATION_FIELDS, "At least one blog mutation field is required.")
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id", "site_id"]) as never,
        site.siteId,
      );
      const hydratedUpdatedBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse(
        { post: toBlogPostProjection(hydratedUpdatedBlogPost) },
        `Updated blog post "${result.post.title ?? result.post.id}". Please review the draft at edit_url before publishing.`,
      );
    }
    case "update_blog_metadata": {
      requireAtLeastOneField(args, BLOG_METADATA_FIELDS, "At least one blog metadata field is required.")
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id", "site_id"]) as never,
        site.siteId,
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
      )
      return blogPostResponse(
        result.post,
        site,
        `Replaced blog post content for "${result.post.title ?? result.post.id}". Please review the draft at edit_url before publishing.`,
      )
    }
    case "publish_blog_post":
    case "unpublish_blog_post": {
      const publish = toolName === "publish_blog_post";
      const result = await updatePlatformBlogPost(site.db, requiredString(args, "post_id"), publish ? { publish: true } : { unpublish: true }, site.siteId);
      const post = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse({ post: toBlogPostProjection(post) }, `${publish ? "Published" : "Unpublished"} blog post "${result.post.title ?? result.post.id}".`);
    }
    case "set_blog_post_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        { featured_image_asset_id: assetId } as never,
        site.siteId,
      );
      const hydratedImageBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse(
        { post: toBlogPostProjection(hydratedImageBlogPost) },
        `Updated image for "${result.post.title ?? result.post.id}".`,
      );
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
      const result = await reorderPlatformBlogPosts(site.db, items, site.siteId)
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

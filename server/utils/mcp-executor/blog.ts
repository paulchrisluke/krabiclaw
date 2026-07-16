import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, reorderPlatformBlogPosts, updatePlatformBlogPost } from '~/server/utils/platform-content'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, objectArray, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

function editUrl(path: unknown, env: ApiRecord) {
  if (typeof path !== 'string' || !path) return null
  if (/^https?:\/\//i.test(path)) return path
  const origin = String(env.NUXT_PUBLIC_PLATFORM_DOMAIN || env.BETTER_AUTH_URL || 'https://krabiclaw.com').replace(/\/$/, '')
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
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
        )).map((post) => attachViewUrlToRecord(post, site, {}, site.env)),
      };
    case "get_blog_post":
      {
        const post = await getPlatformBlogPost(
          site.db,
          requiredString(args, "post_id"),
          site.siteId,
        );
        return {
          post: post ? attachViewUrlToRecord(post, site, {}, site.env) : null,
          expected_document_updated_at: typeof post?.content_document === 'object' && post.content_document
            ? (post.content_document as { document?: { updated_at?: unknown } }).document?.updated_at ?? null
            : null,
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
      const createBlogContext = await mutationContextPayload(site);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "blog_post",
          id: result.post.id,
          slug: result.post.slug,
          edit_url: editUrl(hydratedBlogPost.admin_edit_url, site.env),
          public_url: hydratedBlogPost.public_url,
          updated_at: result.post.updated_at,
          expected_document_updated_at: (result.post.content_document as { document?: { updated_at?: unknown } } | null | undefined)?.document?.updated_at ?? null,
          context: createBlogContext,
        },
        `Created blog post "${result.post.title ?? result.post.id}". Please review the draft at edit_url before publishing.`,
        { post: hydratedBlogPost },
      );
    }
    case "update_blog_post": {
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id"]) as never,
        site.siteId,
      );
      const hydratedUpdatedBlogPost = attachViewUrlToRecord(result.post, site, {}, site.env);
      const updateBlogContext = await mutationContextPayload(site);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "blog_post",
          id: result.post.id,
          slug: result.post.slug,
          edit_url: editUrl(hydratedUpdatedBlogPost.admin_edit_url, site.env),
          public_url: hydratedUpdatedBlogPost.public_url,
          changed_fields: Object.keys(omit(args, ["post_id"])),
          updated_at: result.post.updated_at,
          expected_document_updated_at: (result.post.content_document as { document?: { updated_at?: unknown } } | null | undefined)?.document?.updated_at ?? null,
          context: updateBlogContext,
        },
        `Updated blog post "${result.post.title ?? result.post.id}". Please review the draft at edit_url before publishing.`,
        { post: hydratedUpdatedBlogPost },
      );
    }
    case "publish_blog_post":
    case "unpublish_blog_post": {
      const publish = toolName === "publish_blog_post";
      const result = await updatePlatformBlogPost(site.db, requiredString(args, "post_id"), publish ? { publish: true } : { unpublish: true }, site.siteId);
      const post = attachViewUrlToRecord(result.post, site, {}, site.env);
      return renderStructuredResponse({ ok: true, entity: "blog_post", id: result.post.id, slug: result.post.slug, edit_url: editUrl(post.admin_edit_url, site.env), public_url: post.public_url, updated_at: result.post.updated_at, context: await mutationContextPayload(site) }, `${publish ? "Published" : "Unpublished"} blog post "${result.post.title ?? result.post.id}".`, { post });
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
      const setImageBlogContext = await mutationContextPayload(site);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "blog_post",
          id: result.post.id,
          slug: result.post.slug,
          updated_at: result.post.updated_at,
          context: setImageBlogContext,
        },
        `Updated image for "${result.post.title ?? result.post.id}".`,
        { post: hydratedImageBlogPost },
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
        posts: result.posts.map((post) => attachViewUrlToRecord(post, site, {}, site.env)),
        context: await mutationContextPayload(site),
      }
    }
    case "delete_blog_post": {
      const postId = requiredString(args, "post_id");
      await deletePlatformBlogPost(site.db, postId, site.siteId);
      return { post_id: postId, deleted: true, context: await mutationContextPayload(site) };
    }
    default:
      return NOT_HANDLED
  }
}

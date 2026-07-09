import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, reorderPlatformBlogPosts, updatePlatformBlogPost } from '~/server/utils/platform-content'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, objectArray, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

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
          public_url: hydratedBlogPost.public_url,
          updated_at: result.post.updated_at,
          context: createBlogContext,
        },
        `Created blog post "${result.post.title ?? result.post.id}".`,
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
          changed_fields: Object.keys(omit(args, ["post_id"])),
          updated_at: result.post.updated_at,
          context: updateBlogContext,
        },
        `Updated blog post "${result.post.title ?? result.post.id}".`,
        { post: hydratedUpdatedBlogPost },
      );
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
        if (Object.prototype.hasOwnProperty.call(item, "nav_section")) result.nav_section = (item.nav_section as string | null) ?? null
        if (Object.prototype.hasOwnProperty.call(item, "nav_title")) result.nav_title = (item.nav_title as string | null) ?? null
        if (Object.prototype.hasOwnProperty.call(item, "nav_section_order")) result.nav_section_order = (item.nav_section_order as number | null) ?? null
        if (Object.prototype.hasOwnProperty.call(item, "hide_from_nav")) result.hide_from_nav = item.hide_from_nav === null ? null : Boolean(item.hide_from_nav)
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

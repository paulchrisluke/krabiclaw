import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, updatePlatformBlogPost } from '~/server/utils/platform-content'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

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
    case "delete_blog_post": {
      const postId = requiredString(args, "post_id");
      await deletePlatformBlogPost(site.db, postId, site.siteId);
      return { post_id: postId, deleted: true, context: await mutationContextPayload(site) };
    }
    default:
      return NOT_HANDLED
  }
}

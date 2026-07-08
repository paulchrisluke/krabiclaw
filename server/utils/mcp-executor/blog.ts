import type { McpExecutorContext } from './shared'
import { createPlatformBlogPost, deletePlatformBlogPost, getPlatformBlogPost, listPlatformBlogPosts, updatePlatformBlogPost } from '~/server/utils/platform-content'
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
      return { post: attachViewUrlToRecord(result.post, site, {}, site.env), context: await mutationContextPayload(site) };
    }
    case "update_blog_post": {
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id"]) as never,
        site.siteId,
      );
      return { post: attachViewUrlToRecord(result.post, site, {}, site.env), context: await mutationContextPayload(site) };
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
      return { post: attachViewUrlToRecord(result.post, site, {}, site.env), context: await mutationContextPayload(site) };
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

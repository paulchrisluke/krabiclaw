import type { McpExecutorContext } from './shared'
import { execute, queryFirst } from '~/server/db'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createError } from 'h3'
import { createPost, deletePost, getPost, listPosts, publishPost, updatePost } from '~/server/utils/post-management'
import { getFacebookPagesConnection, getLinkedInstagramAccount, publishToInstagram, publishToPage } from '~/server/utils/facebook-pages'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { isConversationalToolGroupEnabled } from '~/server/utils/conversational-tool-surface'
import { NOT_HANDLED, mutationContextPayload, normalizeChannelsInput, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

export async function handlePostsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_posts":
      return {
        posts: await listPosts(
          site.db,
          site.organizationId,
          site.siteId,
          optionalString(args, "status") ?? undefined,
          optionalString(args, "location_id") ?? undefined,
        ),
      };
    case "get_post":
      return {
        post: await getPost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
        ),
      };
    case "create_post":
      {
        const post = await createPost(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
        );
        return {
          post,
          context: await mutationContextPayload(site, {
            locationId: post && typeof post.location_id === "string" ? post.location_id : null,
          }),
        };
      }
    case "update_post":
      {
        const post = await updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          omit(args, ["post_id"]) as never,
          site.userId,
        );
        return {
          post,
          context: await mutationContextPayload(site, {
            locationId:
              post && typeof post.location_id === "string"
                ? post.location_id
                : null,
          }),
        };
      }
    case "set_post_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const post = await updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          { image_asset_id: assetId },
          site.userId,
        );
      return {
        post,
        context: await mutationContextPayload(site, {
          locationId: post && typeof post.location_id === "string" ? post.location_id : null,
        }),
      };
    }
    case "publish_post": {
      const channels = normalizeChannelsInput(args);
      if (
        channels.some((channel) => channel !== "site") &&
        !isConversationalToolGroupEnabled(site.env, "social_publishing")
      ) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Social publishing is not exposed on this conversational surface. Publish to the site here, or use the dashboard for Facebook, Instagram, and Google Business publishing.",
        );
      }
      const postId = requiredString(args, "post_id");
      const wantsFacebook = channels.includes("facebook");
      const wantsInstagram = channels.includes("instagram");

      let facebookConnection: Awaited<ReturnType<typeof getFacebookPagesConnection>> | null = null;
      if (wantsFacebook || wantsInstagram) {
        if (!(await hasSiteEntitlement(site.db, site.siteId, "managed_service"))) {
          throw createError({
            statusCode: 403,
            statusMessage:
              "Facebook and Instagram publishing require a Managed or SEO Accelerator plan.",
          });
        }
        facebookConnection = await getFacebookPagesConnection(
          site.env as never,
          site.organizationId,
          site.siteId,
        );
        if (!facebookConnection?.facebook_page_id || !facebookConnection.encrypted_page_token) {
          throw createError({
            statusCode: 409,
            statusMessage:
              "Connect a Facebook Page before publishing to Facebook or Instagram.",
          });
        }
      }

      const post = await publishPost(
        site.db,
        site.organizationId,
        site.siteId,
        postId,
        channels,
      );
      if (!post)
        throw createError({ statusCode: 404, statusMessage: "Post not found" });
      const now = new Date().toISOString();

      if (wantsFacebook || wantsInstagram) {
        const pageToken = facebookConnection!.encrypted_page_token!;
        const pageId = facebookConnection!.facebook_page_id!;

        let imageUrl: string | null = null;
        if (post.image_asset_id) {
          const asset = await queryFirst<{ public_url: string | null }>(
            site.db,
            `SELECT public_url FROM media_assets WHERE id = ? AND status = 'active' LIMIT 1`,
            [post.image_asset_id],
          );
          imageUrl = asset?.public_url ?? null;
        }

        if (wantsFacebook) {
          try {
            const fbResult = await publishToPage(pageToken, pageId, {
              message: post.body,
            });
            await execute(
              site.db,
              `UPDATE post_channel_jobs SET status = 'published', provider_post_id = ?, published_at = ? WHERE post_id = ? AND channel = 'facebook'`,
              [fbResult.id, now, postId],
            );
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Facebook publish failed";
            await execute(
              site.db,
              `UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'facebook'`,
              [msg, postId],
            );
          }
        }

        if (wantsInstagram) {
          if (!imageUrl) {
            await execute(
              site.db,
              `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`,
              ["Instagram requires an image — add a photo to this post", postId],
            );
          } else {
            try {
              const igUserId = await getLinkedInstagramAccount(
                pageToken,
                pageId,
              );
              if (!igUserId) {
                await execute(
                  site.db,
                  `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`,
                  ["No Instagram Business account linked to this Facebook Page", postId],
                );
              } else {
                const igResult = await publishToInstagram(
                  pageToken,
                  igUserId,
                  { caption: post.body, imageUrl },
                );
                await execute(
                  site.db,
                  `UPDATE post_channel_jobs SET status = 'published', provider_post_id = ?, published_at = ? WHERE post_id = ? AND channel = 'instagram'`,
                  [igResult.id, now, postId],
                );
              }
            } catch (err) {
              const msg =
                err instanceof Error
                  ? err.message
                  : "Instagram publish failed";
              await execute(
                site.db,
                `UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'instagram'`,
                [msg, postId],
              );
            }
          }
        }
      }

      return {
        post: await getPost(site.db, site.organizationId, site.siteId, postId),
        context: await mutationContextPayload(site, {
          locationId: post && typeof post.location_id === "string" ? post.location_id : null,
        }),
      };
    }
    case "delete_post": {
      const postId = requiredString(args, "post_id");
      return {
        post_id: postId,
        deleted: await deletePost(
          site.db,
          site.organizationId,
          site.siteId,
          postId,
        ),
        context: await mutationContextPayload(site),
      };
    }
    default:
      return NOT_HANDLED
  }
}

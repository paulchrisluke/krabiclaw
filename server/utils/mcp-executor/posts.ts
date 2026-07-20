import type { McpExecutorContext } from './shared'
import { execute, executeBatch, queryAll, queryFirst } from '~/server/db'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createError } from 'h3'
import { createPost, deletePost, getPost, listPosts, PostValidationError, publishPost, updatePost } from '~/server/utils/post-management'
import { getFacebookPagesConnection, getLinkedInstagramAccount, publishToInstagram, publishToPage } from '~/server/utils/facebook-pages'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { isConversationalToolGroupEnabled } from '~/server/utils/conversational-tool-surface'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, normalizeChannelsInput, omit, optionalString, requireActiveImageAsset, requiredString } from './shared'

async function asMcpValidationError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof PostValidationError) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, error.message)
    }
    throw error
  }
}

export async function handlePostsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_posts":
      return {
        posts: (await listPosts(
          site.db,
          site.organizationId,
          site.siteId,
          site.env,
          optionalString(args, "status") ?? undefined,
          optionalString(args, "location_id") ?? undefined,
        )).map((post) => attachViewUrlToRecord(post, site, {}, site.env)),
      };
    case "get_post":
      {
        const post = await getPost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          site.env,
        );
        return {
          post: post ? attachViewUrlToRecord(post, site, {}, site.env) : null,
        };
      }
    case "create_post":
      {
        const post = await asMcpValidationError(() => createPost(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
          site.env,
        ));
        const hydratedPost = attachViewUrlToRecord(post, site, {}, site.env);
        const createPostContext = await mutationContextPayload(site, {
          locationId: post && typeof post.location_id === "string" ? post.location_id : null,
        });
        return renderStructuredResponse(
          {
            ok: true,
            entity: "post",
            id: post.id,
            slug: post.slug,
            public_url: hydratedPost.public_url,
            updated_at: post.updated_at,
            context: createPostContext,
          },
          `Created post "${post.title ?? post.id}".`,
          { post: hydratedPost },
        );
      }
    case "update_post":
      {
        const post = await asMcpValidationError(() => updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          omit(args, ["post_id"]) as never,
          site.userId,
          site.env,
        ));
        if (!post) {
          return renderStructuredResponse(
            { ok: false, entity: "post", id: requiredString(args, "post_id") },
            "No post found with that id — nothing was changed.",
          );
        }
        const hydratedPost = attachViewUrlToRecord(post, site, {}, site.env);
        const updatePostContext = await mutationContextPayload(site, {
          locationId: typeof post.location_id === "string" ? post.location_id : null,
        });
        return renderStructuredResponse(
          {
            ok: true,
            entity: "post",
            id: post.id,
            slug: post.slug,
            changed_fields: Object.keys(omit(args, ["post_id"])),
            updated_at: post.updated_at,
            context: updatePostContext,
          },
          `Updated post "${post.title ?? post.id}".`,
          { post: hydratedPost },
        );
      }
    case "set_post_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const post = await asMcpValidationError(() => updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          { image_asset_id: assetId },
          site.userId,
          site.env,
        ));
      if (!post) {
        return renderStructuredResponse(
          { ok: false, entity: "post", id: requiredString(args, "post_id") },
          "No post found with that id — nothing was changed.",
        );
      }
      const hydratedSetImagePost = attachViewUrlToRecord(post, site, {}, site.env);
      const setImagePostContext = await mutationContextPayload(site, {
        locationId: typeof post.location_id === "string" ? post.location_id : null,
      });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "post",
          id: post.id,
          slug: post.slug,
          updated_at: post.updated_at,
          context: setImagePostContext,
        },
        `Updated image for "${post.title ?? post.id}".`,
        { post: hydratedSetImagePost },
      );
    }
    case "publish_post": {
      const channels = normalizeChannelsInput(args);
      const postId = requiredString(args, "post_id");
      const wantsFacebook = channels.includes("facebook");
      const wantsInstagram = channels.includes("instagram");
      const wantsGmb = channels.includes("gmb");
      const socialEnabled = isConversationalToolGroupEnabled(site.env, "social_publishing");

      let facebookConnection: Awaited<ReturnType<typeof getFacebookPagesConnection>> | null = null;
      let socialSkipReason: string | null = null;
      if (wantsFacebook || wantsInstagram) {
        if (!socialEnabled) {
          socialSkipReason = "social_publishing_disabled";
        } else if (!(await hasSiteEntitlement(site.db, site.siteId, "managed_service"))) {
          socialSkipReason = "not_entitled";
        } else {
          facebookConnection = await getFacebookPagesConnection(
            site.env as never,
            site.organizationId,
            site.siteId,
          );
          if (!facebookConnection?.facebook_page_id || !facebookConnection.encrypted_page_token) {
            socialSkipReason = "not_connected";
          }
        }
      }

      const post = await publishPost(
        site.db,
        site.organizationId,
        site.siteId,
        postId,
        channels,
        site.env,
      );
      if (!post)
        throw createError({ statusCode: 404, statusMessage: "Post not found" });
      const now = new Date().toISOString();

      if (socialSkipReason) {
        const unavailableChannels = channels.filter(channel => channel === "facebook" || channel === "instagram");
        if (unavailableChannels.length > 0) {
          await executeBatch(site.db, unavailableChannels.map(channel => ({
            query: `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = ?`,
            params: [socialSkipReason, postId, channel],
          })));
        }
      }
      if (wantsGmb) {
        await execute(
          site.db,
          `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'gmb'`,
          ["not_connected", postId],
        );
      }

      if ((wantsFacebook || wantsInstagram) && !socialSkipReason) {
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

      // Query actual channel job outcomes to report accurate results. Best-effort:
      // the publish (and any social writes) already succeeded above, so a failure
      // here must not turn a successful publish into a reported failure.
      let channelJobs: Array<{ channel: string; status: string; error: string | null }> = [];
      try {
        channelJobs = await queryAll<{ channel: string; status: string; error: string | null }>(
          site.db,
          `SELECT channel, status, error FROM post_channel_jobs WHERE post_id = ?`,
          [postId],
        );
      } catch (err) {
        console.warn('[publish_post] Failed to read channel job outcomes:', err);
      }

      const publishedChannels = channelJobs.filter(j => j.status === 'published').map(j => j.channel);
      const failedChannels = channelJobs.filter(j => j.status === 'failed').map(j => ({ channel: j.channel, error: j.error }));
      const skippedChannels = channelJobs.filter(j => j.status === 'skipped').map(j => ({ channel: j.channel, error: j.error }));
      const channelOutcomes = Object.fromEntries(channelJobs
        .filter(job => channels.includes(job.channel as never) && job.status !== 'pending')
        .map(job => [job.channel, { status: job.status, ...(job.error ? { reason: job.error } : {}) }]));

      const publishContext = await mutationContextPayload(site, {
        locationId: post && typeof post.location_id === "string" ? post.location_id : null,
      });

      // Attempt to re-fetch the post for the response, but don't fail if it's missing or errors
      let hydratedPublishedPost = null;
      try {
        const publishedPost = await getPost(site.db, site.organizationId, site.siteId, postId, site.env);
        if (publishedPost) {
          hydratedPublishedPost = attachViewUrlToRecord(publishedPost, site, {}, site.env);
        }
      } catch (err) {
        // Refetch failed, but publish succeeded - continue with available post data
        console.warn('[publish_post] Failed to refetch post after publish:', err);
      }

      const hasFailures = failedChannels.length > 0 || skippedChannels.length > 0;
      const successMessage = hasFailures
        ? `Published "${post.title ?? post.id}" to ${publishedChannels.join(", ") || 'no channels'}${failedChannels.length > 0 ? `; failed: ${failedChannels.map(f => f.channel).join(", ")}` : ''}${skippedChannels.length > 0 ? `; skipped: ${skippedChannels.map(s => s.channel).join(", ")}` : ''}.`
        : `Published "${post.title ?? post.id}" to ${publishedChannels.join(", ")}.`;

      return renderStructuredResponse(
        {
          ok: true,
          entity: "post",
          id: post.id,
          slug: post.slug,
          public_url: hydratedPublishedPost?.public_url ?? null,
          channels: publishedChannels,
          channel_outcomes: channelOutcomes,
          context: publishContext,
          ...(hasFailures ? {
            failed_channels: failedChannels,
            skipped_channels: skippedChannels,
          } : {}),
          ...(hydratedPublishedPost ? {} : { warning: "Post data unavailable after publish, but operation succeeded" }),
        },
        successMessage,
        hydratedPublishedPost ? { post: hydratedPublishedPost } : undefined,
      );
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

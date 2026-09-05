import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { HTTPError } from 'nitro';
import { createPost, deletePost, getPost, listPosts, PostValidationError, publishPost, type PostSocialPublish, updatePost } from '~/server/utils/post-management'
import { getFacebookPagesConnection } from '~/server/utils/facebook-pages'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { isConversationalToolGroupEnabled } from '~/server/utils/conversational-tool-surface'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, normalizeChannelsInput, omit, optionalString, requiredString } from './shared'

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
      {
        const posts = (await listPosts(
          site.db,
          site.organizationId,
          site.siteId,
          site.env,
          optionalString(args, "status") ?? undefined,
          optionalString(args, "location_id") ?? undefined,
        )).map((post) => attachViewUrlToRecord(post, site, {}, site.env));
        const page = paginateMcpCollection(posts, args, { resource: `posts:${site.siteId}:${optionalString(args, 'status') ?? ''}:${optionalString(args, 'location_id') ?? ''}` });
        return { posts: page.items, page_info: page.page_info };
      }
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
    case "publish_post": {
      const channels = normalizeChannelsInput(args);
      const postId = requiredString(args, "post_id");
      const wantsFacebook = channels.includes("facebook");
      const wantsInstagram = channels.includes("instagram");
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

      const socialPublish: PostSocialPublish | null = socialSkipReason
        ? { kind: 'unavailable', reason: socialSkipReason }
        : facebookConnection?.facebook_page_id && facebookConnection.encrypted_page_token
          ? { kind: 'connected', pageId: facebookConnection.facebook_page_id, pageToken: facebookConnection.encrypted_page_token }
          : null;
      const post = await publishPost(
        site.db,
        site.organizationId,
        site.siteId,
        postId,
        channels,
        site.env,
        socialPublish,
      );
      if (!post)
        throw new HTTPError({ statusCode: 404, statusMessage: "Post not found" });
      const channelJobs = post.channels.filter(job => channels.includes(job.channel));

      const publishedChannels = [
        ...(channels.includes('site') ? ['site'] : []),
        ...channelJobs.filter(j => j.status === 'published').map(j => j.channel),
      ];
      const failedChannels = channelJobs.filter(j => j.status === 'failed').map(j => ({ channel: j.channel, error: j.error }));
      const skippedChannels = channelJobs.filter(j => j.status === 'skipped').map(j => ({ channel: j.channel, error: j.error }));
      const pendingChannels = channelJobs.filter(j => j.status === 'pending').map(j => j.channel);
      const channelOutcomes = {
        ...Object.fromEntries(channelJobs
          .map(job => [job.channel, { status: job.status, ...(job.error ? { reason: job.error } : {}) }])),
        ...(channels.includes('site') ? { site: { status: 'published' } } : {}),
      };

      const publishContext = await mutationContextPayload(site, {
        locationId: post && typeof post.location_id === "string" ? post.location_id : null,
      });

      const hydratedPublishedPost = attachViewUrlToRecord(post, site, {}, site.env);

      const hasFailures = failedChannels.length > 0 || skippedChannels.length > 0;
      const successMessage = hasFailures || pendingChannels.length > 0
        ? `Published "${post.title ?? post.id}" to ${publishedChannels.join(", ") || 'no channels'}${failedChannels.length > 0 ? `; failed: ${failedChannels.map(f => f.channel).join(", ")}` : ''}${skippedChannels.length > 0 ? `; skipped: ${skippedChannels.map(s => s.channel).join(", ")}` : ''}${pendingChannels.length > 0 ? `; pending: ${pendingChannels.join(", ")}` : ''}.`
        : `Published "${post.title ?? post.id}" to ${publishedChannels.join(", ")}.`;

      return renderStructuredResponse(
        {
          ok: true,
          entity: "post",
          id: post.id,
          slug: post.slug,
          public_url: hydratedPublishedPost.public_url,
          channels: publishedChannels,
          channel_outcomes: channelOutcomes,
          context: publishContext,
          ...(hasFailures ? {
            failed_channels: failedChannels,
            skipped_channels: skippedChannels,
          } : {}),
        },
        successMessage,
        { post: hydratedPublishedPost },
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

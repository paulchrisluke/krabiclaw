import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { HTTPError } from 'nitro';
import { createPost, deletePost, getPost, listPosts, PostValidationError, publishPost, updatePost } from '~/server/utils/post-management'
import type { CloudflareEnv } from '~/server/utils/auth'
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
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_posts":
      {
        const posts = (await listPosts(
          organization.db,
          organization.organizationId,
          optionalString(args, "status") ?? undefined,
          optionalString(args, "location_id") ?? undefined,
        )).map((post) => attachViewUrlToRecord(post, organization, {}));
        const page = paginateMcpCollection(posts, args, { resource: `posts:${organization.organizationId}:${optionalString(args, 'status') ?? ''}:${optionalString(args, 'location_id') ?? ''}` });
        return { posts: page.items, page_info: page.page_info };
      }
    case "get_post":
      {
        const post = await getPost(
          organization.db,
          organization.organizationId,
          requiredString(args, "post_id"),
        );
        return {
          post: post ? attachViewUrlToRecord(post, organization, {}) : null,
        };
      }
    case "create_post":
      {
        const post = await asMcpValidationError(() => createPost(
          organization.db,
          organization.organizationId,
          omit(args, ["organization_id"]),
          organization.userId,
          organization.env,
        ));
        const hydratedPost = attachViewUrlToRecord(post, organization, {});
        const createPostContext = await mutationContextPayload(organization, {
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
          organization.db,
          organization.organizationId,
          requiredString(args, "post_id"),
          omit(args, ["post_id", "organization_id"]),
          organization.userId,
          organization.env,
        ));
        if (!post) {
          return renderStructuredResponse(
            { ok: false, entity: "post", id: requiredString(args, "post_id") },
            "No post found with that id — nothing was changed.",
          );
        }
        const hydratedPost = attachViewUrlToRecord(post, organization, {});
        const updatePostContext = await mutationContextPayload(organization, {
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
      const wantsSocial = channels.includes("facebook") || channels.includes("instagram");
      const socialDisabledReason = wantsSocial && !isConversationalToolGroupEnabled(organization.env, "social_publishing")
        ? "social_publishing_disabled"
        : null;
      const post = await publishPost(
        organization.db,
        organization.organizationId,
        postId,
        channels,
        organization.env as CloudflareEnv,
        socialDisabledReason,
      );
      if (!post)
        throw new HTTPError({ statusCode: 404, statusMessage: "Post not found" });
      const channelJobs = post.channels.filter(job => channels.includes(job.channel));

      const publishedChannels = [
        ...(channels.includes('organization') ? ['organization'] : []),
        ...channelJobs.filter(j => j.status === 'published').map(j => j.channel),
      ];
      const failedChannels = channelJobs.filter(j => j.status === 'failed').map(j => ({ channel: j.channel, error: j.error }));
      const skippedChannels = channelJobs.filter(j => j.status === 'skipped').map(j => ({ channel: j.channel, error: j.error }));
      const pendingChannels = channelJobs.filter(j => j.status === 'pending').map(j => j.channel);
      const channelOutcomes = {
        ...Object.fromEntries(channelJobs
          .map(job => [job.channel, { status: job.status, ...(job.error ? { reason: job.error } : {}) }])),
        ...(channels.includes('organization') ? { organization: { status: 'published' } } : {}),
      };

      const publishContext = await mutationContextPayload(organization, {
        locationId: post && typeof post.location_id === "string" ? post.location_id : null,
      });

      const hydratedPublishedPost = attachViewUrlToRecord(post, organization, {});

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
          organization.db,
          organization.organizationId,
          postId,
        ),
        context: await mutationContextPayload(organization),
      };
    }
    default:
      return NOT_HANDLED
  }
}

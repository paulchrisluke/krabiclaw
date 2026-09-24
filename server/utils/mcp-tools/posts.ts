import { postMutationJsonSchema } from '~/shared/posts'
import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, postMutationResultObject, postObject, postPublishResultObject, organizationTool } from './shared'

const { media: _initialMedia, ...postUpdateProperties } = postMutationJsonSchema.properties

export const POSTS_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'list_posts',
      description: 'List posts. Pass location_id to see only posts scoped to one location; omit to see all posts site-wide (including site-wide ones with no location).',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        status: { type: 'string', enum: ['draft', 'published', 'scheduled'] },
        location_id: { type: 'string', description: 'Filter to posts restricted to this location.' },
        ...paginationInputSchema,
      },
      outputSchema: {
        type: 'object',
        properties: { posts: { type: 'array', items: postObject }, page_info: pageInfoObject },
        required: ['posts', 'page_info'],
      },
    }),
  organizationTool({
      name: 'get_post',
      description: 'Get a post.',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { post_id: { type: 'string' } },
      required: ['post_id'],
      outputSchema: {
        type: 'object',
        properties: { post: postObject },
        required: ['post'],
      },
    }),
  organizationTool({
      name: 'create_post',
      description: 'Create a draft website announcement, or schedule it with scheduled_for. Visibility defaults to public; unlisted posts remain accessible by direct URL after publication but are excluded from indexes. Use publish_post to publish to the site or connected Facebook or Instagram channels. Use standard for news. Event and offer require event.title and a complete local event.schedule. Offer fields are optional and call_to_action is not allowed on offers. CALL uses the selected location phone. Alert supports covid_19 summary and CTA only. Event recurrence supports daily, weekly and monthly rules. Google publishing is unavailable. Use create_blog_post for long-form articles.',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: postMutationJsonSchema.properties,
      required: ['body'],
      outputSchema: postMutationResultObject,
    }),
  organizationTool({
      name: 'update_post',
      description: 'Update a post. Changing post_type clears incompatible topic fields; supply the new event or offer shape together. Edit cover and gallery through media placement tools. Drafts can be scheduled with scheduled_for, independently of event dates. Published posts cannot be rescheduled; use visibility public or unlisted. Use publish_post to publish a scheduled post instead of clearing its date.',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { ...postUpdateProperties, post_id: { type: 'string' } },
      required: ['post_id'],
      outputSchema: postMutationResultObject,
    }),
  organizationTool({
      name: 'publish_post',
      description: 'Publish a post to one or more channels. channels defaults to ["organization"]. Pass ["organization","facebook"] or ["organization","instagram"] or all three to simultaneously publish to social — requires a Facebook Page connected from the dashboard. Instagram additionally requires the post to have an image.',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: {
        post_id: { type: 'string' },
        channels: { type: 'array', items: { type: 'string', enum: ['organization', 'facebook', 'instagram'] }, description: 'Channels to publish to. Defaults to ["organization"].' },
      },
      required: ['post_id'],
      outputSchema: postPublishResultObject,
    }),
  organizationTool({
      name: 'delete_post',
      description: 'Delete a post. Only owners and admins can delete posts.',
      domain: 'posts',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: { post_id: { type: 'string' } },
      required: ['post_id'],
      outputSchema: {
        type: 'object',
        properties: { post_id: { type: 'string' }, deleted: { type: 'boolean' }, error: { type: 'string' } },
      },
    }),
]

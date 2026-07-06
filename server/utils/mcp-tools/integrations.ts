import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

export const INTEGRATIONS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_facebook_connection',
      description: 'Check whether a Facebook Page is connected to this site. If not connected, the response includes connectUrl — a deep link to the dashboard general settings page to connect (same link get_dashboard_link returns for destination "settings.general").',
      domain: 'integrations',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          facebook_page_id: { type: ['string', 'null'] },
          facebook_page_name: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['active', 'disabled', 'error'] },
        },
        required: ['connected'],
      },
    }),
  siteTool({
      name: 'publish_to_facebook',
      description: 'Publish a post to the connected Facebook Page. Requires the Managed plan. Call get_facebook_connection first to confirm a page is connected.',
      domain: 'integrations',
      minimumRole: 'editor',
      confirmRequired: true,
      requiredEntitlement: 'managed_service',
      inputSchema: {
        message: { type: 'string', description: 'Post text content.' },
        link: { type: 'string', description: 'Optional URL to attach to the post.' },
        published: { type: 'boolean', description: 'Publish immediately (true, default). Pass false to save as draft.' },
      },
      required: ['message'],
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          post_id: { type: 'string', description: 'Facebook post ID.' },
          page_name: { type: ['string', 'null'] },
        },
        required: ['success', 'post_id'],
      },
    }),
  siteTool({
      name: 'sync_facebook_page',
      description: 'Pull business info (phone, hours, website, city, description, cover photo) from the connected Facebook Page and write it into the business location record, updating the tenant site. Requires the Managed plan. Optionally pass location_id to target a specific location, and page_id to switch which Facebook Page is connected.',
      domain: 'integrations',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'managed_service',
      inputSchema: {
        location_id: { type: 'string', description: 'Location to sync page info into. Required to actually update the tenant site.' },
        page_id: { type: 'string', description: 'Switch to a different Facebook Page by ID. Omit to use the currently connected page.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          synced_to_location: { type: 'boolean' },
          page: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              about: { type: ['string', 'null'] },
              phone: { type: ['string', 'null'] },
              website: { type: ['string', 'null'] },
              city: { type: ['string', 'null'] },
              fan_count: { type: ['number', 'null'] },
              cover: { type: ['string', 'null'] },
              picture: { type: ['string', 'null'] },
            },
          },
        },
        required: ['success', 'synced_to_location', 'page'],
      },
    }),
]

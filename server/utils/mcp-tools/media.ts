import type { McpToolDefinition } from './shared'
import { mediaAssetObject, siteTool } from './shared'

export const MEDIA_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_site_media_assets',
      description: 'Use this to see the photos and videos already uploaded for a site — "what pictures do I have", "show me my photos". Use it first to find asset IDs before assigning images through business-level tools like set_logo, set_home_hero_image, set_about_story_image, set_home_story_image, set_location_hero_image, set_menu_item_image, set_post_image, or set_experience_image. Filter by kind="image" to narrow results. For video uploads, direct the user to the dashboard media library: https://krabiclaw.com/dashboard/{orgSlug}/sites/{subdomain}/{locationSlug}/media — orgSlug and subdomain come from list_sites, locationSlug from list_locations. After the user uploads, call get_site_media_assets to get the public_url and place it on the page.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { kind: { type: 'string', description: 'Filter by asset type: "image" or "video".' }, location_id: { type: 'string' } },
      outputSchema: {
        type: 'object',
        properties: { assets: { type: 'array', items: mediaAssetObject } },
        required: ['assets'],
      },
    }),
  siteTool({
      name: 'update_media_asset',
      description: 'Update media metadata.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { asset_id: { type: 'string' }, alt_text: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: { updated: mediaAssetObject },
        required: ['updated'],
      },
    }),
  siteTool({
      name: 'delete_media_asset',
      description: 'Delete a media asset.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: { asset_id: { type: 'string' } },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: { deleted: { type: 'boolean' } },
        required: ['deleted'],
      },
    }),
  siteTool({
      name: 'import_menu_from_media',
      description: 'Extract and add menu items from a menu photo or PDF.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { asset_id: { type: 'string' }, menu_name: { type: 'string' } },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: {
          menu: {
            type: 'object',
            description: 'Created menu.',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
          items_created: { type: 'number', description: 'Number of menu items extracted and created.' },
        },
        required: ['menu'],
      },
    }),
]

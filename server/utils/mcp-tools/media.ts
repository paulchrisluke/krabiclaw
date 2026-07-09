import type { McpToolDefinition } from './shared'
import { chatgptFileInput, mediaAssetObject, siteTool } from './shared'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'

export const MEDIA_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_site_media_assets',
      description: 'Use this to see the photos and videos already uploaded for a site — "what pictures do I have", "show me my photos". Use it first to find asset IDs before assigning images through business-level tools like set_logo, set_home_hero_image, set_about_story_image, set_home_story_image, set_location_hero_image, set_menu_item_image, set_post_image, or set_experience_image. Filter by kind="image" to narrow results. For video, call open_media_upload, or the matching scoped widget (open_home_hero_media_upload, open_location_media_upload, open_experience_media_upload) to launch the inline upload widget; the dashboard media library is a fallback only for chat clients that do not support inline widgets. After upload, call get_site_media_assets to get the public_url and place it on the page.',
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
      name: 'upload_user_media',
      description: 'Canonical inline upload path for user-provided images and videos — "add photos", "upload my pictures", "add this video". Accepts a ChatGPT file reference for either an image or a video; the content type is auto-detected from the file bytes, not from a hint. For a video, you may also pass poster_file (an image) to use as its thumbnail. This tool only uploads into the site media library; it does not place the asset on a page. After upload succeeds, call the matching assignment tool (set_home_hero_image, set_home_hero_video, set_logo, set_location_hero_image, set_location_hero_video, set_post_image, set_experience_image, set_experience_video, etc.). Only call this tool directly once the host has actually resolved a `file`/`file_id` value for you (this reliably happens for files sent through the explicit attach/paperclip control). An image the user merely pastes or drops inline into the chat message is NOT guaranteed to come with a resolvable file reference even though you can see it — do not guess or invent a file/file_id value for it. If you do not have a real resolved reference, call open_media_upload (or the scoped variant, e.g. open_experience_media_upload) instead so the user can supply the image through the upload widget.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        file: chatgptFileInput,
        file_id: { type: 'string', description: 'Resolved file identifier for a user-uploaded image or video (e.g. file_abc123). Prefer file when the host can supply it directly.' },
        poster_file: { ...chatgptFileInput, description: 'Optional poster/thumbnail image for a video upload. Ignored for image uploads.' },
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'other'], description: 'What this media will be used for.' },
        description: { type: 'string', description: 'Description of the media (stored as alt text).' },
        oneOf: [
          { required: ['file'] },
          { required: ['file_id'] },
        ],
      },
      required: [],
      fileParams: ['file', 'poster_file'],
      outputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          publicUrl: { type: 'string' },
          thumbnailUrl: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['image', 'video'] },
          posterWarning: { type: ['string', 'null'] },
          nextStep: { type: 'string' },
        },
        required: ['assetId', 'publicUrl', 'kind'],
      },
    }),
  siteTool({
      name: 'open_media_upload',
      description: 'Launches the inline KrabiClaw media upload widget so the user can pick or drag an image or video without leaving the conversation. This is the primary path for video, and an alternative to the file-attachment path for images. After the widget reports a completed upload, call the matching assignment tool (set_home_hero_image, set_home_hero_video, set_logo, set_location_hero_image, set_location_hero_video, set_post_image, etc.) with the returned assetId. Prefer a scoped variant when the target is already known: open_home_hero_media_upload, open_location_media_upload, open_experience_media_upload, open_post_media_upload, or open_menu_item_media_upload.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      uiResourceUri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
      inputSchema: {
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'other'], description: 'What this media will be used for.' },
        accept: { type: 'string', enum: ['image', 'video', 'both'], description: 'Restrict the widget file picker. Defaults to both.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          launched: { type: 'boolean' },
          resourceUri: { type: 'string' },
        },
        required: ['launched', 'resourceUri'],
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

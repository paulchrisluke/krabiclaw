import type { McpToolDefinition } from './shared'
import { chatgptFileInput, mediaAssetObject, siteTool } from './shared'
import { VIDEO_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'

export const MEDIA_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_site_media_assets',
      description: 'Use this to see the photos and videos already uploaded for a site — "what pictures do I have", "show me my photos". Use it first to find asset IDs before assigning images through business-level tools like set_logo, set_home_hero_image, set_about_story_image, set_home_story_image, set_location_hero_image, set_menu_item_image, set_post_image, or set_experience_image. Filter by kind="image" to narrow results. For video, call open_video_upload to launch the inline upload widget. Images use direct ChatGPT attachments or native image generation. After upload, call get_site_media_assets to get the public_url and place it on the page.',
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
      description: 'Canonical inline upload path for user-provided images, videos, and Markdown documents (.md/.markdown). Accepts a resolved ChatGPT file reference and validates the actual bytes. The returned asset_id is active and immediately assignable. For a video, poster_file may provide a thumbnail. Only call this tool when the host supplied a real file/file_id reference; never invent one.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        file: chatgptFileInput,
        file_id: { type: 'string', description: 'Resolved file identifier for a user-uploaded image, video, or Markdown document (e.g. file_abc123). Prefer file when the host can supply the filename directly.' },
        poster_file: { ...chatgptFileInput, description: 'Optional poster/thumbnail image for a video upload. Ignored for image uploads.' },
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'blog', 'other'], description: 'What this media will be used for.' },
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
          asset_id: { type: 'string' },
          publicUrl: { type: 'string' },
          public_url: { type: 'string' },
          status: { type: 'string', enum: ['active'] },
          thumbnailUrl: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['image', 'video', 'file'] },
          posterWarning: { type: ['string', 'null'] },
          nextStep: { type: 'string' },
        },
        required: ['asset_id', 'assetId', 'status', 'public_url', 'publicUrl', 'kind'],
      },
    }),
  siteTool({
      name: 'open_video_upload',
      description: 'Launch the inline KrabiClaw video upload widget. Use this only when a video upload is required; images should arrive as direct ChatGPT attachments or through native image generation. The widget returns an active assetId and publicUrl. Then call the appropriate video assignment tool, such as set_home_hero_video, set_location_hero_video, or set_experience_video.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      uiResourceUri: VIDEO_UPLOAD_WIDGET_RESOURCE_URI,
      inputSchema: {
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'blog', 'other'], description: 'What this media will be used for.' },
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
  siteTool({
      name: 'analyze_document',
      description: 'Summarize, answer questions about, or extract information from an uploaded Markdown document (.md/.markdown), grounded strictly in that file. Use upload_user_media with the attached Markdown file or get_site_media_assets to obtain its asset_id. Pass a question for grounded Q&A; omit it for a summary.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        asset_id: { type: 'string', description: 'Media asset ID of the uploaded Markdown document.' },
        question: { type: 'string', description: 'Optional question to answer using only the document content. Omit for a summary.' },
      },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string', description: 'Grounded answer or summary.' },
          creditsRemaining: { type: 'number', description: 'AI credits remaining after document analysis.' },
          stats: {
            type: 'object',
            description: 'Structural stats detected in the document.',
            properties: {
              headings: { type: 'number' },
              listItems: { type: 'number' },
              tableRows: { type: 'number' },
              codeBlocks: { type: 'number' },
              blockquotes: { type: 'number' },
              links: { type: 'number' },
            },
          },
        },
        required: ['answer', 'creditsRemaining', 'stats'],
      },
    }),
]

export const MEDIA_COMPAT_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'open_media_upload',
    description: 'Deprecated compatibility adapter for the former inline media upload widget. Prefer upload_user_media for images and open_video_upload for videos.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    uiResourceUri: VIDEO_UPLOAD_WIDGET_RESOURCE_URI,
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
]

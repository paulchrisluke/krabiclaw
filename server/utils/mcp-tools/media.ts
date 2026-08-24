import type { McpToolDefinition } from './shared'
import { chatgptFileInput, mediaAssetObject, resolvedMediaAssetObject, siteTool } from './shared'

const mediaEntityIdFields = ['location_id', 'menu_item_id', 'post_id', 'experience_id'] as const

function mediaTargetBranch(targetTypes: string[], requiredEntityId?: typeof mediaEntityIdFields[number]) {
  const forbiddenEntityIds = mediaEntityIdFields.filter(field => field !== requiredEntityId)
  return {
    properties: {
      target_type: targetTypes.length === 1
        ? { const: targetTypes[0] }
        : { enum: targetTypes },
    },
    ...(requiredEntityId ? { required: [requiredEntityId] } : {}),
    not: { anyOf: forbiddenEntityIds.map(field => ({ required: [field] })) },
  }
}

export const MEDIA_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'set_media',
      description: 'Assign existing media assets to exactly one CMS placement. Pass target_type as a top-level enum and use only the matching entity-id field returned by a read tool. asset_ids is the complete desired state; an empty array clears it. Position 0 is the cover for ordered mixed-media placements. Video cover/hero assets must already have thumbnail_url/poster metadata.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      strict: true,
      inputSchema: {
        target_type: {
          type: 'string',
          enum: ['site_logo', 'home_hero', 'home_story_image', 'about_story_image', 'location_hero', 'menu_item_media', 'post_image', 'blog_post_image', 'experience_media'],
          description: 'The placement to replace. This is a required top-level field.',
        },
        location_id: { type: 'string', description: 'Required only for location_hero. Use the exact id returned by get_location or list_locations; never pass a slug, name, URL, or site_id.' },
        menu_item_id: { type: 'string', description: 'Required only for menu_item_media. Use the exact id returned by a menu read tool.' },
        post_id: { type: 'string', description: 'Required only for post_image or blog_post_image. Use the exact id returned by the matching post read tool.' },
        experience_id: { type: 'string', description: 'Required only for experience_media. Use the exact id returned by get_experience or list_experiences.' },
        asset_ids: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
          description: 'Complete desired asset-id state for the target. Empty clears. Duplicates are rejected.',
        },
        oneOf: [
          mediaTargetBranch(['site_logo', 'home_hero', 'home_story_image', 'about_story_image']),
          mediaTargetBranch(['location_hero'], 'location_id'),
          mediaTargetBranch(['menu_item_media'], 'menu_item_id'),
          mediaTargetBranch(['post_image', 'blog_post_image'], 'post_id'),
          mediaTargetBranch(['experience_media'], 'experience_id'),
        ],
      },
      required: ['target_type', 'asset_ids'],
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entity: { type: 'string' },
          id: { type: 'string' },
          target: { type: 'object' },
          asset_ids: { type: 'array', items: { type: 'string' } },
          media: { type: 'array', items: resolvedMediaAssetObject },
          cleared: { type: 'boolean' },
          updated_at: { type: ['string', 'null'] },
          location_id: { type: ['string', 'null'] },
          context: { type: 'object' },
        },
        required: ['ok', 'entity', 'id', 'target', 'asset_ids', 'media', 'cleared'],
      },
    }),
  siteTool({
      name: 'get_site_media_assets',
      description: 'List uploaded images, videos, or Markdown files for a site. Use it first to find asset IDs before assigning image/video media with set_media or analyzing a file with analyze_document. New user-provided media uses upload_user_media with a native ChatGPT attachment.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { kind: { type: 'string', enum: ['image', 'video', 'file'], description: 'Filter by asset type.' }, location_id: { type: 'string' } },
      outputSchema: {
        type: 'object',
        properties: { assets: { type: 'array', items: mediaAssetObject } },
        required: ['assets'],
      },
    }),
  siteTool({
      name: 'upload_user_media',
      description: 'The only upload path for user-provided images, videos, and Markdown documents (.md/.markdown). Call it only with the resolved native ChatGPT file argument; never pass a bare file_id or invent a download URL. One call performs one download attempt. If attachment delivery fails, stop and ask the user to attach the file again instead of trying another transport. The returned asset_id is active. Every video requires poster_file so the asset always has thumbnail_url metadata.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      strict: true,
      inputSchema: {
        file: chatgptFileInput,
        poster_file: { ...chatgptFileInput, description: 'Required poster/thumbnail image for video uploads. Invalid for non-video uploads.' },
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'blog', 'other'], description: 'What this media will be used for.' },
        description: { type: 'string', description: 'Description of the media (stored as alt text).' },
      },
      required: ['file'],
      fileParams: ['file', 'poster_file'],
      outputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
          public_url: { type: 'string' },
          status: { type: 'string', enum: ['active'] },
          thumbnail_url: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['image', 'video', 'file'] },
          next_step: { type: 'string' },
        },
        required: ['asset_id', 'status', 'public_url', 'kind'],
      },
    }),
  siteTool({
      name: 'update_media_asset',
      description: 'Update media metadata.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      strict: true,
      inputSchema: {
        asset_id: { type: 'string' },
        alt_text: { type: 'string' },
        location_id: { type: 'string' },
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'logo', 'blog', 'other'] },
        anyOf: [{ required: ['alt_text'] }, { required: ['location_id'] }, { required: ['category'] }],
      },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: { updated: { type: 'boolean' } },
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

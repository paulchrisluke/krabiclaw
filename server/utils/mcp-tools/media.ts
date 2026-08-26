import type { McpToolDefinition } from './shared'
import { chatgptFileInput, mediaAssetObject, resolvedMediaAssetObject, siteTool } from './shared'
import { EDITABLE_MEDIA_PLACEMENT_OWNERS } from '~/server/utils/media-placement'

const mediaPlacementObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    owner_type: { type: 'string', enum: [...EDITABLE_MEDIA_PLACEMENT_OWNERS] },
    owner_id: { type: 'string' },
    slot: { type: 'string' },
  },
  required: ['owner_type', 'owner_id', 'slot'],
}

export const MEDIA_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'set_media',
      description: 'Assign existing media assets to one canonical CMS placement. Construct placement from the target entity: owner_type is its entity type, owner_id is its id, and slot is the media role. For a post cover use {owner_type:"post", owner_id:<post.id>, slot:"cover"}; for a location hero use {owner_type:"business_location", owner_id:<location.id>, slot:"hero"}. asset_ids is the complete desired state; an empty array clears it. Array order is display order. Video cover/hero assets must already have thumbnail_url/poster metadata.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      strict: true,
      inputSchema: {
        placement: mediaPlacementObject,
        asset_ids: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
          description: 'Complete desired asset-id state for the target. Empty clears. Duplicates are rejected.',
        },
      },
      required: ['placement', 'asset_ids'],
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entity: { type: 'string' },
          id: { type: 'string' },
          placement: mediaPlacementObject,
          asset_ids: { type: 'array', items: { type: 'string' } },
          media: { type: 'array', items: resolvedMediaAssetObject },
          cleared: { type: 'boolean' },
          context: { type: 'object' },
        },
        required: ['ok', 'entity', 'id', 'placement', 'asset_ids', 'media', 'cleared'],
      },
    }),
  siteTool({
      name: 'get_site_media_assets',
      description: 'List uploaded images, videos, or Markdown files for a site. Use it first to find asset IDs before assigning image/video media with set_media or analyzing a file with analyze_document. New user-provided media uses upload_user_media with a native ChatGPT attachment.',
      domain: 'media',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { kind: { type: 'string', enum: ['image', 'video', 'file'], description: 'Filter by asset type.' } },
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
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'other'], description: 'Optional visual subject used to organize the media library. It never assigns the asset to content.' },
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
        category: { type: 'string', enum: ['exterior', 'interior', 'food', 'menu', 'team', 'other'] },
        anyOf: [{ required: ['alt_text'] }, { required: ['category'] }],
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
      confirmRequired: true,
      inputSchema: { asset_id: { type: 'string' }, menu_name: { type: 'string' } },
      required: ['asset_id', 'menu_name'],
      outputSchema: {
        type: 'object',
        properties: {
          menuId: { type: ['string', 'null'], description: 'Created menu ID, or null when no items were detected.' },
          count: { type: 'number', description: 'Number of menu items extracted and created.' },
          warning: { type: ['string', 'null'] },
          creditsRemaining: { type: 'number' },
        },
        required: ['menuId', 'count', 'warning', 'creditsRemaining'],
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

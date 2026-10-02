import type { McpToolDefinition } from './shared'
import { chatgptFileInput, mediaAssetObject, pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, organizationTool } from './shared'
import { EDITABLE_MEDIA_PLACEMENT_OWNERS, WRITABLE_MEDIA_CATEGORIES } from '~/server/utils/media-placement'

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

const mediaMutationOutputSchema = {
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
} as const

export const MEDIA_TOOLS: McpToolDefinition[] = [
  organizationTool({
      name: 'set_media',
      description: 'Assign one media asset to a single-valued CMS placement (a placement that holds at most one asset, such as a post cover, a location hero, or a site logo). Construct placement from the target entity: owner_type is its entity type, owner_id is its id, and slot is the media role. For a post cover use {owner_type:"content_document", owner_id:<post.id>, slot:"cover"}; for a location hero use {owner_type:"business_location", owner_id:<location.id>, slot:"hero"}. Pass asset_id:null to clear it. For an ordered collection (a gallery or a compliance document list, which can hold many assets) use attach_media, remove_media, and reorder_media instead — this tool rejects those. Video cover/hero assets must already have thumbnail_url/poster metadata.',
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        placement: mediaPlacementObject,
        asset_id: { type: ['string', 'null'], description: 'One asset id, or null to clear this single-valued placement.' },
      },
      required: ['placement', 'asset_id'],
      outputSchema: mediaMutationOutputSchema,
    }),
  organizationTool({
      name: 'attach_media',
      description: 'Attach one existing media asset to an ordered collection placement (a gallery or a compliance document list), appending it after the current last item. Rejects if the asset is already attached, or if the collection is full. For a single-valued placement (a cover, hero, or logo) use set_media instead.',
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        placement: mediaPlacementObject,
        asset_id: { type: 'string', description: 'The single media asset id to attach.' },
      },
      required: ['placement', 'asset_id'],
      outputSchema: mediaMutationOutputSchema,
    }),
  organizationTool({
      name: 'remove_media',
      description: 'Detach one media asset from an ordered collection placement (a gallery or a compliance document list). Removing an asset that is not attached changes nothing; other attached assets keep their order.',
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        placement: mediaPlacementObject,
        asset_id: { type: 'string', description: 'The single media asset id to detach.' },
      },
      required: ['placement', 'asset_id'],
      outputSchema: mediaMutationOutputSchema,
    }),
  organizationTool({
      name: 'reorder_media',
      description: 'Reorder assets already attached to an ordered collection placement (a gallery or a compliance document list) without changing which assets are attached. Each move names one already-attached asset_id and, optionally, a before_asset_id or after_asset_id (also already attached) to move it next to; omit both to move it to the end. Moves apply in the order given. Rejects the entire call if any named asset or anchor is not currently attached — it never attaches, restores, or detaches anything.',
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        placement: mediaPlacementObject,
        moves: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              asset_id: { type: 'string' },
              before_asset_id: { type: 'string' },
              after_asset_id: { type: 'string' },
            },
            required: ['asset_id'],
          },
          description: 'Ordered list of moves to apply sequentially.',
        },
      },
      required: ['placement', 'moves'],
      outputSchema: mediaMutationOutputSchema,
    }),
  organizationTool({
      name: 'get_organization_media_assets',
      description: 'List the images, videos and Markdown files in the selected site’s media library, with the asset IDs set_media and attach_media take. A file still in the conversation is saved with save_media_attachment.',
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { kind: { type: 'string', enum: ['image', 'video', 'file'], description: 'Filter by asset type.' }, ...paginationInputSchema },
      outputSchema: {
        type: 'object',
        properties: { assets: { type: 'array', items: mediaAssetObject }, page_info: pageInfoObject },
        required: ['assets', 'page_info'],
      },
    }),
  organizationTool({
      name: 'save_media_attachment',
      description: "Save a file from the conversation to the selected site’s media library when the user asks: an image the user attached or generated, a video with its poster image, or a Markdown document. Requires the file reference supplied by the host. Creates an asset with a public URL; set_media or attach_media places it. Each call downloads once, so retrying an uncertain call can create a duplicate asset.",
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        file: chatgptFileInput,
        poster_file: { ...chatgptFileInput, description: 'Required poster/thumbnail image for video uploads. Invalid for non-video uploads.' },
        category: { type: 'string', enum: [...WRITABLE_MEDIA_CATEGORIES], description: 'Optional visual subject used to organize the media library. It never assigns the asset to content.' },
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
  organizationTool({
      name: 'update_media_asset',
      description: "Change the selected asset’s alt text or library category. At least one field is required. Category organizes the library and does not assign media to a page.",
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        asset_id: { type: 'string' },
        alt_text: { type: 'string' },
        category: { type: 'string', enum: [...WRITABLE_MEDIA_CATEGORIES] },
        anyOf: [{ required: ['alt_text'] }, { required: ['category'] }],
      },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: { updated: { type: 'boolean' } },
        required: ['updated'],
      },
    }),
  organizationTool({
      name: 'delete_media_asset',
      description: "Delete the selected site media asset and remove its website placements. Deletes stored media when no other asset references it. Refused while a social publication pins the asset; published provider posts are not deleted.",
      domain: 'media',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: { asset_id: { type: 'string' } },
      required: ['asset_id'],
      outputSchema: {
        type: 'object',
        properties: { deleted: { type: 'boolean' } },
        required: ['deleted'],
      },
    }),
]

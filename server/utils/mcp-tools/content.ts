import { CONTENT_BLOCK_TYPES, describeContentBlockTextFields } from '~/shared/content-registries'
import type { McpToolDefinition } from './shared'
import { locationReservationConfigObject, locationReservationConfigWriteSchema, pageInfoObject, paginationInputSchema, renderedBookingPolicySummaryObject, siteTool } from './shared'

const TENANT_PAGE_METADATA_SCHEMA = {
  path: { type: 'string' },
  title: { type: 'string' },
  summary: { type: ['string', 'null'] },
  seoTitle: { type: ['string', 'null'] },
  seoDescription: { type: ['string', 'null'] },
  canonicalUrl: { type: ['string', 'null'] },
  robots: { type: ['string', 'null'], enum: [...ROBOTS_DIRECTIVE_ENUM, null], description: 'Search engine indexing directive. Leave unset for the default index,follow.' },
  pageType: { type: 'string', enum: ['custom', 'recipe', 'legal', 'system'] },
  recipe: { type: ['string', 'null'] },
  sortOrder: { type: ['number', 'null'] },
}

const TENANT_PAGE_BLOCKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      position: { type: 'number' },
      data: { type: 'object', description: describeContentBlockTextFields(CONTENT_BLOCK_TYPES) },
      media: {
        type: 'array',
        items: {
          type: 'object',
          properties: { asset_id: { type: 'string' }, slot: { type: 'string' } },
          required: ['asset_id', 'slot'],
          additionalProperties: false,
        },
      },
    },
    required: ['type', 'data'],
    additionalProperties: false,
  },
  description: 'Complete canonical block array. Each existing block must retain its id unless its removal is explicitly confirmed. Block data never contains asset IDs or delivery URLs. Omit media to preserve that block\'s current placements; provide media explicitly to replace them, or call set_media with owner_type "content_block", the block id, and the intended slot.',
}

const TENANT_PAGE_LIFECYCLE_OUTPUT = {
  type: 'object',
  properties: { page: { type: 'object' }, replacement_confirmation: { type: 'object' } },
}

export const CONTENT_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_tenant_pages',
      description: 'List canonical tenant-page variants for one manually managed locale. Automated translation is not used; create or update each locale explicitly.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { locale: { type: ['string', 'null'] }, ...paginationInputSchema },
      outputSchema: { type: 'object', properties: { pages: { type: 'array', items: { type: 'object' } }, page_info: pageInfoObject }, required: ['pages', 'page_info'] },
    }),
  siteTool({
      name: 'get_tenant_page',
      description: 'Get one canonical tenant-page variant, including its current document timestamp and blocks.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { variant_id: { type: 'string' } },
      required: ['variant_id'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  siteTool({
      name: 'create_tenant_page',
      description: 'Create a manually authored tenant-page variant. A non-source locale must provide page_id for an existing source page; no automated translation is performed.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: {
        page_id: { type: ['string', 'null'] },
        variant_id: { type: ['string', 'null'] },
        locale: { type: ['string', 'null'] },
        ...TENANT_PAGE_METADATA_SCHEMA,
        blocks: TENANT_PAGE_BLOCKS_SCHEMA,
      },
      required: ['path', 'title', 'blocks'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  siteTool({
      name: 'update_tenant_page',
      description: 'Update canonical tenant-page content with optimistic concurrency. Provide the complete blocks array and expected_updated_at from the last read. If existing block ids are omitted, also provide the exact removed_block_ids and confirmation_token returned by the canonical page read.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: {
        variant_id: { type: 'string' },
        expected_updated_at: { type: 'string' },
        ...TENANT_PAGE_METADATA_SCHEMA,
        blocks: TENANT_PAGE_BLOCKS_SCHEMA,
        removed_block_ids: { type: 'array', items: { type: 'string' } },
        confirmation_token: { type: 'string' },
      },
      required: ['variant_id', 'expected_updated_at', 'blocks'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  siteTool({
      name: 'change_tenant_page_path',
      description: 'Change a canonical tenant-page path and immediately create its locale-scoped redirect. Safe tenant-page redirect chains are flattened during the update.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: { variant_id: { type: 'string' }, new_path: { type: 'string' }, expected_updated_at: { type: 'string' } },
      required: ['variant_id', 'new_path', 'expected_updated_at'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  siteTool({
      name: 'get_reservation_policy',
      description: 'Get the reservation policy for one location. A null policy means the location does not take reservations; there is no site-level policy underneath it.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string' },
        locale: { type: 'string' },
      },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: {
          policy: { ...locationReservationConfigObject, type: ['object', 'null'] },
          summary: { ...renderedBookingPolicySummaryObject, type: ['object', 'null'] },
        },
        required: ['policy', 'summary'],
      },
    }),
  siteTool({
      name: 'update_reservation_policy',
      description: 'Create or amend the reservation policy for one location. Creating it is what lets the location take reservations. Omitted fields keep their stored value; a field set to null is cleared to "not stated", which is not a default.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string' },
        locale: { type: 'string' },
        ...locationReservationConfigWriteSchema,
      },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entity: { type: 'string', enum: ['reservation_policy'] },
          location_id: { type: 'string' },
          changed_fields: { type: 'array', items: { type: 'string' } },
          updated_at: { type: 'string' },
          context: { type: 'object' },
          summary: renderedBookingPolicySummaryObject,
        },
        required: ['ok', 'entity', 'location_id'],
      },
    }),
]

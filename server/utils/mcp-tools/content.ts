import { CONTENT_BLOCK_TYPES, describeContentBlockTextFields } from '~/shared/content-registries'
import type { McpToolDefinition } from './shared'
import { contentBlockMediaInputObject, contentBlockUpdatedAtInput, locationReservationConfigObject, locationReservationConfigWriteSchema, pageInfoObject, paginationInputSchema, renderedBookingPolicySummaryObject, ROBOTS_DIRECTIVE_ENUM, siteTool } from './shared'

// Create and update both write the whole document: an omitted metadata field is
// written as null, never carried over from the stored row. path and title are
// required on both for that reason.
const TENANT_PAGE_METADATA_SCHEMA = {
  path: { type: 'string', description: 'The page path to write. Send the current path unless you are moving the page; a different path moves it and creates the locale-scoped redirect.' },
  title: { type: 'string', description: 'The page title to write. Always sent in full — an omitted title is not kept.' },
  summary: { type: ['string', 'null'] },
  seoTitle: { type: ['string', 'null'] },
  seoDescription: { type: ['string', 'null'] },
  canonicalUrl: { type: ['string', 'null'] },
  robots: { type: ['string', 'null'], enum: [...ROBOTS_DIRECTIVE_ENUM, null], description: 'Search engine indexing directive. Leave unset for the default index,follow.' },
  pageType: { type: 'string', enum: ['custom', 'recipe', 'legal', 'system'], description: "The page's type. Send the page_type from the last read unless you are changing it." },
  recipe: { type: ['string', 'null'], description: 'The template section this page fills, or null for a page that fills none. Send the recipe from the last read unless you are changing it; an omitted recipe is not kept.' },
  sortOrder: { type: 'number', description: "The page's position in the site's page list. Send the sort_order from the last read unless you are reordering." },
}

const TENANT_PAGE_BLOCKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      source_block_id: { type: ['string', 'null'] },
      parent_block_id: { type: ['string', 'null'] },
      level: { type: ['integer', 'null'], minimum: 1, maximum: 6 },
      data: { type: 'object', description: describeContentBlockTextFields(CONTENT_BLOCK_TYPES) },
      media: { type: 'array', items: contentBlockMediaInputObject },
      updated_at: contentBlockUpdatedAtInput,
    },
    required: ['type', 'data'],
    additionalProperties: false,
  },
  description: 'Complete canonical block array. Each existing block must retain its id unless its removal is explicitly confirmed. Block data never contains asset IDs or delivery URLs. Omit media to preserve that block\'s current placements; provide media explicitly to replace them, or call set_media with owner_type "content_block", the block id, and the intended slot.',
}

// One block, addressed by id, on any content document: a blog article, a tenant
// page variant, a doc. Where it sits is a relationship to a neighbour, so an
// insert names the block it follows and nothing states a position. The whole
// document write (update_blog_post, update_tenant_page) is for rewriting an
// article; these are for changing one thing in it.
const CONTENT_BLOCK_WRITE_SCHEMA = {
  type: { type: 'string', enum: [...CONTENT_BLOCK_TYPES] },
  data: { type: 'object', description: describeContentBlockTextFields(CONTENT_BLOCK_TYPES) },
  media: { type: 'array', items: contentBlockMediaInputObject, description: 'Required on image blocks: one item, the picture. Send a block\'s media as a read returned it.' },
  level: { type: ['integer', 'null'], minimum: 1, maximum: 6, description: 'Heading blocks only.' },
}

const CONTENT_BLOCKS_OUTPUT = {
  type: 'object',
  properties: {
    document_id: { type: 'string' },
    updated_at: { type: 'string', description: 'The document\'s new concurrency token.' },
    blocks: { type: 'array', items: { type: 'object' }, description: 'The whole document after the change, in order, each block with its id and updated_at.' },
  },
  required: ['document_id', 'updated_at', 'blocks'],
  additionalProperties: false,
}

const TENANT_PAGE_LIFECYCLE_OUTPUT = {
  type: 'object',
  properties: { page: { type: 'object' }, replacement_confirmation: { type: 'object' } },
}

export const CONTENT_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'append_content_block',
      description: 'Insert one block into a blog article or tenant page: after the block named by after_block_id, or at the end. The first block of an article, when it is an image, is the article\'s cover. Returns the whole document so the next edit has every block\'s id and updated_at.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        document_id: { type: 'string', description: 'The blog post id or tenant page variant id.' },
        after_block_id: { type: ['string', 'null'], description: 'The block this one follows. Omit to append at the end.' },
        ...CONTENT_BLOCK_WRITE_SCHEMA,
      },
      required: ['document_id', 'type', 'data'],
      outputSchema: CONTENT_BLOCKS_OUTPUT,
    }),
  siteTool({
      name: 'replace_content_block',
      description: 'Replace one block\'s data and media in place, keeping its position. Requires the block\'s own updated_at from the last read; a stale token is rejected with a conflict.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        block_id: { type: 'string' },
        expected_updated_at: { type: 'string', description: 'The block\'s updated_at from the last read.' },
        data: CONTENT_BLOCK_WRITE_SCHEMA.data,
        media: CONTENT_BLOCK_WRITE_SCHEMA.media,
      },
      required: ['block_id', 'expected_updated_at', 'data'],
      outputSchema: CONTENT_BLOCKS_OUTPUT,
    }),
  siteTool({
      name: 'delete_content_block',
      description: 'Delete one block, and any blocks nested under it, from a blog article or tenant page. Requires the block\'s own updated_at from the last read.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        block_id: { type: 'string' },
        expected_updated_at: { type: 'string', description: 'The block\'s updated_at from the last read.' },
      },
      required: ['block_id', 'expected_updated_at'],
      outputSchema: CONTENT_BLOCKS_OUTPUT,
    }),
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
      description: 'Replace canonical tenant-page content with optimistic concurrency. This writes the whole document: provide the complete blocks array, path, title and expected_updated_at from the last read, because every omitted metadata field is written as null rather than kept. Sending a different path moves the page and creates its locale-scoped redirect. If existing block ids are omitted, also provide the exact removed_block_ids and confirmation_token returned by the canonical page read.',
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
      required: ['variant_id', 'expected_updated_at', 'path', 'title', 'pageType', 'recipe', 'sortOrder', 'blocks'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  siteTool({
      name: 'delete_tenant_page',
      description: 'Delete a canonical tenant page. Deleting a translation removes that translation; deleting the source locale removes the page and every translation with it, and the response names the locales that went. A page the site template renders cannot be deleted, because its route would then have nothing to show.',
      domain: 'content',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: {
        variant_id: { type: 'string' },
        expected_updated_at: { type: 'string', description: 'The document timestamp from the last read, so a page edited since is refused rather than silently removed.' },
      },
      required: ['variant_id', 'expected_updated_at'],
      outputSchema: {
        type: 'object',
        properties: {
          deleted: {
            type: 'object',
            properties: {
              id: { type: 'string' }, path: { type: 'string' }, locale: { type: 'string' },
              removed_locales: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'path', 'locale', 'removed_locales'],
          },
        },
        required: ['deleted'],
      },
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

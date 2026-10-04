import { CONTENT_BLOCK_TYPES, describeContentBlockTextFields } from '~/shared/content-registries'
import type { McpToolDefinition } from './shared'
import { contentBlockMediaInputObject, contentBlockUpdatedAtInput, locationReservationConfigObject, locationReservationConfigWriteSchema, pageInfoObject, paginationInputSchema, renderedBookingPolicySummaryObject, organizationTool } from './shared'
import { HTTPError } from 'nitro';
import { CANCELLATION_TIER_IDS, cancellationPatch, cancellationTierOf, type CancellationTierId } from "~/shared/availability-settings";
import type { McpExecutorContext } from './execution'
import {
  getLocationReservationConfig,
  renderBookingPolicySummary,
  reservationPolicySummarySource,
  upsertLocationReservationConfig,
  validateLocationReservationConfigPatch,
} from '~/server/utils/reservations'
import { buildTenantPageReplacementConfirmationToken } from '~/server/utils/mcp-workflows'
import {
  createTenantPage,
  deleteTenantPage,
  getTenantPageById,
  listTenantPages,
  updateTenantPage,
} from '~/server/utils/content/pages'
import {
  appendContentBlock,
  deleteContentBlock,
  getContentBlock,
  getContentDocumentById,
  getContentOutline,
  replaceContentBlock,
  type ContentBlockMedia,
  type ContentBlockType,
} from '~/server/utils/content/documents'
import { prepareTenantBlogContentBlocks } from '~/server/utils/content/publishing'
import { executeBatch } from '~/server/db'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { refreshSocialCard } from '~/server/utils/social-card'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, omit, mutationContextPayload, optionalString, requiredString, rethrowAsInvalidParams } from './execution'

// Create and update both write the whole document: an omitted metadata field is
// written as null, never carried over from the stored row. path and title are
// required on both for that reason.
const TENANT_PAGE_METADATA_SCHEMA = {
  path: { type: 'string', description: 'The page path to write. Send the current path unless you are moving the page; a different path moves it and creates the locale-scoped redirect.' },
  title: { type: 'string', description: 'The page title to write. Always sent in full — an omitted title is not kept.' },
  summary: { type: ['string', 'null'] },
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
// document write (update_blog_post, update_site_page) is for rewriting an
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
  organizationTool({
      name: 'append_content_block',
      description: "Add a content block to an existing blog article or site page when the user requests an insertion. Read the document first and use after_block_id to insert after an existing block; omit it to append. An image in the first article block becomes its cover. Returns the updated document with block IDs and timestamps.",
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        document_id: { type: 'string', description: 'The blog post id or site page variant id.' },
        after_block_id: { type: ['string', 'null'], description: 'The block this one follows. Omit to append at the end.' },
        ...CONTENT_BLOCK_WRITE_SCHEMA,
      },
      required: ['document_id', 'type', 'data'],
      outputSchema: CONTENT_BLOCKS_OUTPUT,
    }),
  organizationTool({
      name: 'replace_content_block',
      description: 'Replace one block\'s data and media in place, keeping its position. Requires the block\'s own updated_at from the last read; a stale token is rejected with a conflict.',
      domain: 'content',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'delete_content_block',
      description: 'Delete one block, and any blocks nested under it, from a blog article or site page. Requires the block\'s own updated_at from the last read.',
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        block_id: { type: 'string' },
        expected_updated_at: { type: 'string', description: 'The block\'s updated_at from the last read.' },
      },
      required: ['block_id', 'expected_updated_at'],
      outputSchema: CONTENT_BLOCKS_OUTPUT,
    }),
  organizationTool({
      name: 'list_site_pages',
      description: "List authored site-page variants for the requested language, with their paths and document identities. Each language is managed explicitly; this tool does not generate translations.",
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { locale: { type: ['string', 'null'] }, ...paginationInputSchema },
      outputSchema: { type: 'object', properties: { pages: { type: 'array', items: { type: 'object' } }, page_info: pageInfoObject }, required: ['pages', 'page_info'] },
    }),
  organizationTool({
      name: 'get_site_page',
      description: "Read one site-page language variant, including its path, title, ordered blocks and current timestamp. Use its returned IDs and concurrency information for edits.",
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: { variant_id: { type: 'string' } },
      required: ['variant_id'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  organizationTool({
      name: 'create_site_page',
      description: "Create an authored site-page language variant. For a secondary language, page_id must name an existing source-language page. Content must be supplied for that language; this tool does not translate it.",
      domain: 'content',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'update_site_page',
      description: "Replace a site-page language variant when the user wants to edit its content or metadata. Read it first and supply the complete blocks, path, title, pageType, recipe, sortOrder and expected_updated_at. Omitted summary is cleared. Omitted product_id retains the linked product; null removes the link. A changed path creates a language-specific redirect. To remove blocks, supply the exact removed_block_ids and confirmation_token from the page read.",
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: {
        variant_id: { type: 'string' },
        product_id: { type: ['string', 'null'], description: 'Explicit canonical Product binding on the source page only. Omit to retain; null unbinds. Translations inherit the source binding; slugs never imply a relationship.' },
        expected_updated_at: { type: 'string' },
        ...TENANT_PAGE_METADATA_SCHEMA,
        blocks: TENANT_PAGE_BLOCKS_SCHEMA,
        removed_block_ids: { type: 'array', items: { type: 'string' } },
        confirmation_token: { type: 'string' },
      },
      required: ['variant_id', 'expected_updated_at', 'path', 'title', 'pageType', 'recipe', 'sortOrder', 'blocks'],
      outputSchema: TENANT_PAGE_LIFECYCLE_OUTPUT,
    }),
  organizationTool({
      name: 'delete_site_page',
      description: 'Delete the selected site page or translation. Deleting a translation removes that translation; deleting the source locale removes the page and every translation with it, and the response names the locales that went. A page the site template renders cannot be deleted, because its route would then have nothing to show.',
      domain: 'content',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'get_reservation_policy',
      description: 'Get the reservation policy for one location. A null policy means the location does not take reservations; there is no site-level policy underneath it.',
      domain: 'content',
      minimumRole: 'admin',
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
          cancellation_policy: { type: ['string', 'null'], enum: [...CANCELLATION_TIER_IDS, null], description: 'The named cancellation policy the dashboard shows, or null when the stored cutoffs match none of them.' },
          summary: { ...renderedBookingPolicySummaryObject, type: ['object', 'null'] },
        },
        required: ['policy', 'cancellation_policy', 'summary'],
      },
    }),
  organizationTool({
      name: 'update_reservation_policy',
      description: 'Create or amend the reservation policy for one location — the calendar settings\' advance notice, seats per time slot and cancellation policy, and guest-facing notes. Deposit and reschedule fields are stored settings; the reservation flow does not collect deposits or enforce reschedule cutoffs. Creating it is what lets the location take reservations. Omitted fields keep their stored value; a field set to null is cleared to "not stated", which is not a default.',
      domain: 'content',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        location_id: { type: 'string' },
        locale: { type: 'string' },
        ...locationReservationConfigWriteSchema,
        cancellation_policy: { type: 'string', enum: CANCELLATION_TIER_IDS, description: 'Flexible: 2 hours. Moderate: 1 day. Firm: 2 days. Sets the stored free-cancellation and reschedule cutoffs together; do not also pass those fields. The guest cancellation route does not enforce these cutoffs.' },
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

function nullableStringArg(args: Record<string, unknown>, key: string, fallback: string | null): string | null {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return fallback
  const value = args[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null`)
  return value.trim()
}

// Required, but legitimately null: a page that fills no template section has no
// recipe. The caller must say which, rather than omitting the key and having the
// stored row read back in.
function requiredNullableString(args: Record<string, unknown>, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(args, key)) throw new Error(`${key} is required, and may be null`)
  const value = args[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null`)
  return value.trim()
}

function requiredNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a number`)
  return value
}

/** A block as MCP reads it: where it sits is its index in the array, so no position. */
function withoutPosition<T extends { position?: number }>(block: T): Omit<T, 'position'> {
  const { position: _position, ...rest } = block
  return rest
}

function tenantPageLifecycleResponse(action: string, result: unknown) {
  const page = result && typeof result === 'object' && 'page' in result && result.page && typeof result.page === 'object' && Array.isArray((result.page as { blocks?: unknown }).blocks)
    ? { ...result, page: { ...(result.page as object), blocks: ((result.page as { blocks: Array<{ position?: number }> }).blocks).map(withoutPosition) } }
    : result && typeof result === 'object' && Array.isArray((result as { blocks?: unknown }).blocks)
      ? { ...result, blocks: ((result as { blocks: Array<{ position?: number }> }).blocks).map(withoutPosition) }
      : result
  return renderStructuredResponse(page, `${action} tenant page.`, { tenant_page: page })
}

function tenantPageReplacementConfirmation(page: Awaited<ReturnType<typeof getTenantPageById>>) {
  const removedBlockIds = page.blocks.map(block => block.id).sort()
  return {
    expected_updated_at: page.document.updated_at,
    current_block_ids: page.blocks.map(block => block.id),
    confirmation_format: 'tenant-page-replacement:<expected_updated_at>:<sorted_removed_block_ids_comma_separated>',
    confirmation_token_for_removing_all_current_blocks: buildTenantPageReplacementConfirmationToken(page.document.updated_at, removedBlockIds),
  }
}

function assertTenantPageReplacementConfirmed(
  page: Awaited<ReturnType<typeof getTenantPageById>>,
  args: Record<string, unknown>,
) {
  if (!Array.isArray(args.blocks)) throw new Error('blocks must be the complete canonical block array')
  const incomingBlockIds = new Set(
    args.blocks
      .map(block => block && typeof block === 'object' && 'id' in block && typeof (block as { id?: unknown }).id === 'string'
        ? (block as { id: string }).id
        : null)
      .filter((id): id is string => Boolean(id)),
  )
  const removedBlockIds = page.blocks.map(block => block.id).filter(id => !incomingBlockIds.has(id)).sort()
  if (!removedBlockIds.length) return
  const expectedUpdatedAt = typeof args.expected_updated_at === 'string' ? args.expected_updated_at : ''
  const requestedRemovedIds = Array.isArray(args.removed_block_ids)
    ? args.removed_block_ids.filter((id): id is string => typeof id === 'string').sort()
    : []
  const confirmationToken = typeof args.confirmation_token === 'string' ? args.confirmation_token : ''
  const expectedToken = buildTenantPageReplacementConfirmationToken(page.document.updated_at, removedBlockIds)
  if (expectedUpdatedAt !== page.document.updated_at || requestedRemovedIds.join(',') !== removedBlockIds.join(',') || confirmationToken !== expectedToken) {
    throw new HTTPError({
      statusCode: 409,
      statusMessage: `Complete block replacement would remove ${removedBlockIds.length} existing block(s). Confirm with expected_updated_at="${page.document.updated_at}", removed_block_ids=${JSON.stringify(removedBlockIds)}, confirmation_token="${expectedToken}".`,
    })
  }
}

/**
 * The document a block operation addresses, and only if it is this site's. A
 * block id from another site is not found here rather than forbidden: the
 * caller learns nothing about what exists elsewhere.
 */
async function requireOrganizationDocument(ctx: McpExecutorContext, documentId: string) {
  const document = await getContentDocumentById(ctx.organization.db, documentId)
  if (!document || document.organization_id !== ctx.organization.organizationId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Content document not found' })
  }
  return document
}

/**
 * After a block changed: the public copy is stale, an article's social card may
 * be, and the caller gets the whole document back so its next edit holds every
 * block's id and updated_at.
 */
async function contentBlocksChanged(ctx: McpExecutorContext, document: { id: string; kind: string }, message: string) {
  const { organization } = ctx
  await executeBatch(organization.db, [publicResourceCacheInvalidationQuery(organization.organizationId, `${document.kind}-block-write`)])
  if (document.kind === 'article' && organization.env) {
    await refreshSocialCard({ db: organization.db, env: organization.env, owner: { owner_type: 'content_document', owner_id: document.id } })
  }
  const current = await getContentDocumentById(organization.db, document.id)
  if (!current) throw new HTTPError({ statusCode: 500, statusMessage: 'Content document disappeared after write' })
  return renderStructuredResponse(
    { document_id: document.id, updated_at: current.updated_at, blocks: (await getContentOutline(organization.db, document.id)).map(withoutPosition) },
    message,
  )
}

export async function handleContentTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_site_pages":
      try {
        const pages = await listTenantPages(organization.db, organization.organizationId, { locale: optionalString(args, "locale") });
        const page = paginateMcpCollection(pages, args, { resource: `tenant-pages:${organization.organizationId}:${optionalString(args, 'locale') ?? ''}` });
        return { pages: page.items, page_info: page.page_info };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_site_page":
      try {
        const page = await getTenantPageById(organization.db, requiredString(args, "variant_id"), {
          organizationId: organization.organizationId,
        })
        return tenantPageLifecycleResponse("Read", {
          page,
          replacement_confirmation: tenantPageReplacementConfirmation(page),
        });
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "create_site_page":
      try {
        const created = await createTenantPage(organization.db, {
          organizationId: organization.organizationId,
          userId: organization.userId,
          data: {
            id: optionalString(args, "variant_id") ?? undefined,
            pageId: optionalString(args, "page_id") ?? undefined,
            locale: optionalString(args, "locale") ?? undefined,
            path: requiredString(args, "path"),
            title: requiredString(args, "title"),
            summary: nullableStringArg(args, "summary", null),
            // Omitted is omitted: a translation takes its identity from the
            // source page, and a null here would be read as stating a
            // different one.
            pageType: (optionalString(args, "pageType") ?? undefined) as "custom" | "recipe" | "legal" | "system" | undefined,
            recipe: nullableStringArg(args, "recipe", null),
            sortOrder: typeof args.sortOrder === 'number' ? args.sortOrder : null,
            blocks: args.blocks,
          },
          env: organization.env,
        });
        return tenantPageLifecycleResponse("Created", created);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "update_site_page":
      try {
        const variantId = requiredString(args, "variant_id");
        const page = await getTenantPageById(organization.db, variantId, {
          organizationId: organization.organizationId,
        });
        assertTenantPageReplacementConfirmed(page, args)
        const updated = await updateTenantPage(organization.db, variantId, {
          userId: organization.userId,
          scope: { organizationId: organization.organizationId},
          data: {
            productId: args.product_id === undefined ? undefined : requiredNullableString(args, "product_id"),
            path: requiredString(args, "path"),
            title: requiredString(args, "title"),
            summary: nullableStringArg(args, "summary", null),
            pageType: requiredString(args, "pageType") as "custom" | "recipe" | "legal" | "system",
            recipe: requiredNullableString(args, "recipe"),
            sortOrder: requiredNumber(args, "sortOrder"),
            blocks: args.blocks,
            expectedUpdatedAt: requiredString(args, "expected_updated_at"),
          },
          env: organization.env,
        });
        return tenantPageLifecycleResponse("Updated", updated);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "delete_site_page":
      try {
        const deleted = await deleteTenantPage(organization.db, requiredString(args, "variant_id"), {
          scope: { organizationId: organization.organizationId},
          expectedUpdatedAt: requiredString(args, "expected_updated_at"),
          env: organization.env,
        });
        return tenantPageLifecycleResponse("Deleted", deleted);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_reservation_policy": {
      const locationId = requiredString(args, "location_id");
      const locale = optionalString(args, "locale") ?? "en";
      const config = await getLocationReservationConfig(organization.db, {
        organizationId: organization.organizationId,
        locationId,
      });
      // No row means this location does not take reservations. That is the
      // answer; there is no site-level policy underneath it to merge in.
      return {
        policy: config,
        cancellation_policy: config ? cancellationTierOf(config) : null,
        summary: config ? renderBookingPolicySummary(reservationPolicySummarySource(config), locale) : null,
      };
    }
    case "update_reservation_policy": {
      const locationId = requiredString(args, "location_id");
      const locale = optionalString(args, "locale") ?? "en";
      // A named policy is its two cutoffs, written as the dashboard writes them.
      const tier = args.cancellation_policy;
      if (tier !== undefined && !CANCELLATION_TIER_IDS.includes(tier as CancellationTierId)) {
        throw new Error(`cancellation_policy must be one of ${CANCELLATION_TIER_IDS.join(", ")}`);
      }
      if (tier !== undefined && ["free_cancellation_until_minutes", "reschedule_allowed", "reschedule_cutoff_minutes"].some((field) => field in args)) {
        throw new Error("Pass cancellation_policy or the cancellation cutoffs, not both");
      }
      const patch = await validateLocationReservationConfigPatch({
        ...omit(args as Record<string, unknown>, ["location_id", "locale", "cancellation_policy"]),
        ...(tier === undefined ? {} : cancellationPatch(tier as CancellationTierId)),
      });
      const config = await upsertLocationReservationConfig(organization.db, {
        organizationId: organization.organizationId,
        locationId,
        patch,
        actorId: organization.userId,
      });
      const policyContext = await mutationContextPayload(organization, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "reservation_policy",
          location_id: locationId,
          changed_fields: Object.keys(patch),
          updated_at: config.updated_at,
          context: policyContext,
          summary: renderBookingPolicySummary(reservationPolicySummarySource(config), locale),
        },
        "Updated the reservation policy.",
        { policy: config },
      );
    }
    case "append_content_block": {
      const document = await requireOrganizationDocument(ctx, requiredString(args, "document_id"))
      const afterBlockId = optionalString(args, "after_block_id")
      const id = crypto.randomUUID()
      // The same normalisation every whole-document write goes through: the
      // asset must be this site's, an image block must carry its picture.
      const { blocks, placementQueries } = await prepareTenantBlogContentBlocks(
        organization.db, [{ id, type: args.type as ContentBlockType, data: args.data as Record<string, unknown>, media: args.media as ContentBlockMedia[] | undefined, level: typeof args.level === 'number' ? args.level : null }],
        organization.organizationId,
      )
      const block = blocks[0]!
      // One batch: the block and its media land together or not at all.
      await appendContentBlock(organization.db, document.id, { id, type: block.type, data: block.data, level: block.level ?? null, after_block_id: afterBlockId ?? null }, { additionalQueriesAfter: placementQueries })
      return await contentBlocksChanged(ctx, document, `Added a ${block.type} block.`)
    }
    case "replace_content_block": {
      const blockId = requiredString(args, "block_id")
      const existing = await getContentBlock(organization.db, blockId)
      const document = await requireOrganizationDocument(ctx, existing.document_id)
      const { blocks, placementQueries } = await prepareTenantBlogContentBlocks(
        organization.db, [{ id: blockId, type: existing.type, data: args.data as Record<string, unknown>, media: (args.media ?? existing.media) as ContentBlockMedia[], level: existing.level }],
        organization.organizationId,
      )
      await replaceContentBlock(organization.db, blockId, { data: blocks[0]!.data, expected_updated_at: requiredString(args, "expected_updated_at") }, { additionalQueriesAfter: placementQueries })
      return await contentBlocksChanged(ctx, document, `Replaced the ${existing.type} block.`)
    }
    case "delete_content_block": {
      const blockId = requiredString(args, "block_id")
      const existing = await getContentBlock(organization.db, blockId)
      const document = await requireOrganizationDocument(ctx, existing.document_id)
      await deleteContentBlock(organization.db, blockId, { expected_updated_at: requiredString(args, "expected_updated_at") })
      return await contentBlocksChanged(ctx, document, `Deleted the ${existing.type} block.`)
    }
    default:
      return NOT_HANDLED
  }
}

import { HTTPError } from 'nitro';

import type { McpExecutorContext } from './shared'
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
import { NOT_HANDLED, omit, mutationContextPayload, optionalString, requiredString, rethrowAsInvalidParams } from './shared'

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
    case "list_tenant_pages":
      try {
        const pages = await listTenantPages(organization.db, organization.organizationId, { locale: optionalString(args, "locale") });
        const page = paginateMcpCollection(pages, args, { resource: `tenant-pages:${organization.organizationId}:${optionalString(args, 'locale') ?? ''}` });
        return { pages: page.items, page_info: page.page_info };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_tenant_page":
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
    case "create_tenant_page":
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
    case "update_tenant_page":
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
    case "delete_tenant_page":
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
        summary: config ? renderBookingPolicySummary(reservationPolicySummarySource(config), locale) : null,
      };
    }
    case "update_reservation_policy": {
      const locationId = requiredString(args, "location_id");
      const locale = optionalString(args, "locale") ?? "en";
      const patch = await validateLocationReservationConfigPatch(
        omit(args as Record<string, unknown>, ["location_id", "locale"]),
      );
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

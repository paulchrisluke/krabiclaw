import { HTTPError } from 'nitro';

import type { McpExecutorContext } from './shared'
import { applyBookingPolicyPatch, getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, upsertBookingPolicy, validateBookingPolicyPatch, validateBookingPolicyScope, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'
import { buildTenantPageReplacementConfirmationToken } from '~/server/utils/mcp-workflows'
import {
  createTenantPage,
  getTenantPageById,
  listTenantPages,
  updateTenantPage,
} from '~/server/utils/tenant-pages'
import { getProfessionalServiceContent, upsertProfessionalServiceContent } from '~/server/utils/professional-services-editor'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, mutationContextPayload, optionalString, requiredString, rethrowAsInvalidParams } from './shared'

function nullableStringArg(args: Record<string, unknown>, key: string, fallback: string | null): string | null {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return fallback
  const value = args[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null`)
  return value.trim()
}

function tenantPageDocumentData(args: Record<string, unknown>, page: Awaited<ReturnType<typeof getTenantPageById>>) {
  const blocks = args.blocks === undefined ? page.blocks : args.blocks
  return {
    path: typeof args.path === 'string' ? args.path : page.path,
    title: typeof args.title === 'string' ? args.title : page.title,
    summary: nullableStringArg(args, 'summary', page.summary),
    seoTitle: nullableStringArg(args, 'seoTitle', page.seo_title),
    seoDescription: nullableStringArg(args, 'seoDescription', page.seo_description),
    canonicalUrl: nullableStringArg(args, 'canonicalUrl', page.canonical_url),
    robots: nullableStringArg(args, 'robots', page.robots),
    pageType: typeof args.pageType === 'string' ? args.pageType as typeof page.page_type : page.page_type,
    recipe: nullableStringArg(args, 'recipe', page.recipe),
    sortOrder: typeof args.sortOrder === 'number' ? args.sortOrder : page.sort_order,
    blocks,
    expectedDocumentUpdatedAt: requiredString(args, 'expected_document_updated_at'),
  }
}

function tenantPageLifecycleResponse(action: string, result: unknown) {
  return renderStructuredResponse(result, `${action} tenant page.`, { tenant_page: result })
}

function bookingPolicyTarget(args: Record<string, unknown>, policyType: BookingPolicyType) {
  const locationId = optionalString(args, 'location_id')
  const experienceId = optionalString(args, 'experience_id')
  const scopeType = (optionalString(args, 'scope_type') ?? (policyType === 'reservation' ? 'location' : 'site')) as BookingPolicyScopeType
  validateBookingPolicyScope({ policyType, scopeType, locationId, experienceId })
  return { locationId, experienceId, scopeType }
}

function tenantPageReplacementConfirmation(page: Awaited<ReturnType<typeof getTenantPageById>>) {
  const removedBlockIds = page.blocks.map(block => block.id).sort()
  return {
    expected_document_updated_at: page.document.updated_at,
    current_block_ids: page.blocks.map(block => block.id),
    confirmation_format: 'tenant-page-replacement:<expected_document_updated_at>:<sorted_removed_block_ids_comma_separated>',
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
  const expectedDocumentUpdatedAt = typeof args.expected_document_updated_at === 'string' ? args.expected_document_updated_at : ''
  const requestedRemovedIds = Array.isArray(args.removed_block_ids)
    ? args.removed_block_ids.filter((id): id is string => typeof id === 'string').sort()
    : []
  const confirmationToken = typeof args.confirmation_token === 'string' ? args.confirmation_token : ''
  const expectedToken = buildTenantPageReplacementConfirmationToken(page.document.updated_at, removedBlockIds)
  if (expectedDocumentUpdatedAt !== page.document.updated_at || requestedRemovedIds.join(',') !== removedBlockIds.join(',') || confirmationToken !== expectedToken) {
    throw new HTTPError({
      statusCode: 409,
      statusMessage: `Complete block replacement would remove ${removedBlockIds.length} existing block(s). Confirm with expected_document_updated_at="${page.document.updated_at}", removed_block_ids=${JSON.stringify(removedBlockIds)}, confirmation_token="${expectedToken}".`,
    })
  }
}

export async function handleContentTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_tenant_pages":
      try {
        const pages = await listTenantPages(site.db, site.siteId, { locale: optionalString(args, "locale") });
        const page = paginateMcpCollection(pages, args, { resource: `tenant-pages:${site.siteId}:${optionalString(args, 'locale') ?? ''}` });
        return { pages: page.items, page_info: page.page_info };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_tenant_page":
      try {
        const page = await getTenantPageById(site.db, requiredString(args, "variant_id"), {
          siteId: site.siteId,
          organizationId: site.organizationId,
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
        const created = await createTenantPage(site.db, {
          organizationId: site.organizationId,
          siteId: site.siteId,
          userId: site.userId,
          data: {
            id: optionalString(args, "variant_id") ?? undefined,
            pageId: optionalString(args, "page_id") ?? undefined,
            locale: optionalString(args, "locale") ?? undefined,
            path: requiredString(args, "path"),
            title: requiredString(args, "title"),
            summary: nullableStringArg(args, "summary", null),
            seoTitle: nullableStringArg(args, "seoTitle", null),
            seoDescription: nullableStringArg(args, "seoDescription", null),
            canonicalUrl: nullableStringArg(args, "canonicalUrl", null),
            robots: nullableStringArg(args, "robots", null),
            pageType: optionalString(args, "pageType") as "custom" | "recipe" | "legal" | "system" | undefined,
            recipe: nullableStringArg(args, "recipe", null),
            sortOrder: typeof args.sortOrder === 'number' ? args.sortOrder : null,
            blocks: args.blocks,
          },
        });
        return tenantPageLifecycleResponse("Created", created);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "update_tenant_page":
      try {
        const variantId = requiredString(args, "variant_id");
        const page = await getTenantPageById(site.db, variantId, {
          siteId: site.siteId,
          organizationId: site.organizationId,
        });
        assertTenantPageReplacementConfirmed(page, args)
        const updated = await updateTenantPage(site.db, variantId, {
          userId: site.userId,
          scope: { siteId: site.siteId, organizationId: site.organizationId },
          data: tenantPageDocumentData(args, page),
        });
        return tenantPageLifecycleResponse("Updated", updated);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "change_tenant_page_path":
      try {
        const variantId = requiredString(args, "variant_id");
        const page = await getTenantPageById(site.db, variantId, {
          siteId: site.siteId,
          organizationId: site.organizationId,
        });
        const updated = await updateTenantPage(site.db, variantId, {
          userId: site.userId,
          scope: { siteId: site.siteId, organizationId: site.organizationId },
          data: tenantPageDocumentData({ ...args, path: requiredString(args, "new_path") }, page),
        });
        return tenantPageLifecycleResponse("Changed path for", updated);
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_professional_service_content":
      console.info(
        "[MCP] get_professional_service_content invoked site=%s",
        site.siteId,
      );
      return await getProfessionalServiceContent(site.db, site.siteId);
    case "update_professional_service_content":
      try {
        const updated = await upsertProfessionalServiceContent(site.db, {
          organizationId: site.organizationId,
          siteId: site.siteId,
          data: {
            ...(Object.hasOwn(args, 'offerings') ? { offerings: args.offerings } : {}),
            ...(Object.hasOwn(args, 'compliance') ? { compliance: args.compliance } : {}),
            ...(Object.hasOwn(args, 'consultation') ? { consultation: args.consultation } : {}),
            ...(Object.hasOwn(args, 'themeTokens') ? { themeTokens: args.themeTokens } : {}),
          },
          updatedBy: site.userId,
        });
        const context = await mutationContextPayload(site);
        return renderStructuredResponse(
          {
            ...updated,
            context,
          },
          "Updated professional-service content.",
          { professional_service_content: updated, context },
        );
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const { locationId, experienceId, scopeType } = bookingPolicyTarget(args, policyType);
      const locale = optionalString(args, "locale") ?? "en";
      const policy = await getDirectBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        scopeType,
        locationId,
        experienceId,
      });
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      return {
        policy,
        resolved_policy: resolvedPolicy,
        summary: resolvedPolicy.id ? renderBookingPolicySummary(resolvedPolicy, locale) : null,
      };
    }
    case "preview_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const { locationId, experienceId } = bookingPolicyTarget(args, policyType);
      const locale = optionalString(args, "locale") ?? "en";
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      const preview = applyBookingPolicyPatch(
        resolvedPolicy,
        await validateBookingPolicyPatch(args as Record<string, unknown>, policyType),
      );
      return {
        resolved_policy: preview,
        summary: renderBookingPolicySummary(preview, locale),
      };
    }
    case "update_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const { locationId, experienceId, scopeType } = bookingPolicyTarget(args, policyType);
      const locale = optionalString(args, "locale") ?? "en";
      const patch = await validateBookingPolicyPatch(args as Record<string, unknown>, policyType);
      const policy = await upsertBookingPolicy(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        policyType,
        scopeType,
        locationId,
        experienceId,
        patch,
      });
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      const policyContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "booking_policy",
          id: policy.id,
          policy_type: policyType,
          scope_type: scopeType,
          changed_fields: Object.keys(patch),
          updated_at: policy.updated_at,
          context: policyContext,
          summary: renderBookingPolicySummary(resolvedPolicy, locale),
        },
        `Updated ${policyType} booking policy.`,
        { policy, resolved_policy: resolvedPolicy },
      );
    }
    default:
      return NOT_HANDLED
  }
}

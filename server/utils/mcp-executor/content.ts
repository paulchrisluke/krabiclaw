import type { McpExecutorContext } from './shared'
import { applyBookingPolicyPatch, getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, upsertBookingPolicy, validateBookingPolicyPatch, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'
import { deleteContentField, getEditorContent, updateHomeHero, updatePageContent } from '~/server/utils/mcp-workflows'
import { getProfessionalServiceContent, upsertProfessionalServiceContent } from '~/server/utils/professional-services-editor'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { attachViewUrlToRecord, NOT_HANDLED, mutationContextPayload, objectRecord, optionalString, requiredString, rethrowAsInvalidParams } from './shared'

export async function handleContentTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_page_fields":
      console.info(
        "[MCP] get_page_fields invoked page=%s site=%s",
        args.page,
        site.siteId,
      );
      return attachViewUrlToRecord(await getEditorContent(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "page"),
        optionalString(args, "location_id") ?? undefined,
      ), site, {}, site.env);
    case "update_page_content":
      try {
        const locationId = optionalString(args, "location_id");
        const page = requiredString(args, "page");
        const changes = objectRecord(args.changes, "changes");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page,
            changes,
            location_id: locationId,
          },
        );
        const hydratedPageContent = attachViewUrlToRecord(updated, site, {}, site.env);
        const pageContentContext = await mutationContextPayload(site, { locationId });
        return renderStructuredResponse(
          {
            success: true,
            page,
            location_id: locationId ?? null,
            changes_count: Object.keys(changes).length,
            public_path: updated.public_path,
            view_url: hydratedPageContent.view_url,
            context: pageContentContext,
          },
          `Updated ${page} page content.`,
          { page_content: hydratedPageContent },
        );
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
          data: objectRecord(args, "content"),
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
      const scopeType = (optionalString(args, "scope_type") ?? "site") as BookingPolicyScopeType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
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
        summary: renderBookingPolicySummary(resolvedPolicy, locale),
      };
    }
    case "preview_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
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
      const scopeType = (optionalString(args, "scope_type") ?? "site") as BookingPolicyScopeType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
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
    case "update_home_hero":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          title: optionalString(args, "title"),
          subtitle: optionalString(args, "subtitle"),
          location_id: locationId,
        });
        return {
          ...attachViewUrlToRecord(updated, site, {}, site.env),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "delete_content_field":
      {
        const locationId = optionalString(args, "location_id");
        const result = await deleteContentField(
        site.db,
        site.organizationId,
        site.siteId,
        {
          page: requiredString(args, "page"),
          field: requiredString(args, "field"),
          location_id: locationId,
        },
        );
        return {
          ...attachViewUrlToRecord(result, site, {}, site.env),
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    default:
      return NOT_HANDLED
  }
}

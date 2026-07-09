import type { McpExecutorContext } from './shared'
import { applyBookingPolicyPatch, getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, upsertBookingPolicy, validateBookingPolicyPatch, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'
import { deleteContentField, getEditorContent, updateHomeHero, updatePageContent } from '~/server/utils/mcp-workflows'
import { getProfessionalServiceContent, upsertProfessionalServiceContent } from '~/server/utils/professional-services-editor'
import { getMediaAsset } from '~/server/utils/media-asset-manager'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { attachViewUrlToRecord, NOT_HANDLED, getCurrentHomeHeroState, mutationContextPayload, objectRecord, optionalString, requireActiveImageAsset, requireActiveVideoAsset, requiredString, rethrowAsInvalidParams } from './shared'

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
      return await getProfessionalServiceContent(site.db, site.siteId);
    case "update_professional_service_content":
      try {
        const updated = await upsertProfessionalServiceContent(site.db, {
          organizationId: site.organizationId,
          siteId: site.siteId,
          data: objectRecord(args, "content"),
          updatedBy: site.userId,
        });
        return {
          ...updated,
          context: await mutationContextPayload(site),
        };
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
          image_asset_id: optionalString(args, "image_asset_id"),
          video_asset_id: optionalString(args, "video_asset_id"),
          location_id: locationId,
        });
        return {
          ...attachViewUrlToRecord(updated, site, {}, site.env),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_hero_image":
      try {
        const assetId = requiredString(args, "asset_id");
        const locationId = optionalString(args, "location_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const currentHero = await getCurrentHomeHeroState(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
        );
        const update = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          image_asset_id: assetId,
          location_id: locationId,
        });
        const asset = await getMediaAsset(site.db, assetId, site.siteId);
        return {
          ...attachViewUrlToRecord(update, site, {}, site.env),
          asset_id: assetId,
          asset_public_url: asset?.public_url ?? null,
          ...(currentHero.hero_video_asset_id
            ? {
                warning:
                  "This page already has a hero video, which takes display priority over a hero image. The video will keep showing. Call clear_home_hero_video first if you want this image to display instead.",
              }
            : {}),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_hero_video":
      try {
        const assetId = requiredString(args, "asset_id");
        const locationId = optionalString(args, "location_id");
        await requireActiveVideoAsset(site.db, site.siteId, assetId, "asset_id");
        const currentHero = await getCurrentHomeHeroState(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
        );
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          video_asset_id: assetId,
          location_id: locationId,
        });
        return {
          ...attachViewUrlToRecord(updated, site, {}, site.env),
          ...(currentHero.hero_image_asset_id
            ? {
                warning:
                  "This page already has a hero image, but the new hero video will take display priority over it.",
              }
            : {}),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "clear_home_hero_image":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          image_asset_id: null,
          location_id: locationId,
        });
        return {
          ...attachViewUrlToRecord(updated, site, {}, site.env),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "clear_home_hero_video":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          video_asset_id: null,
          location_id: locationId,
        });
        return {
          ...attachViewUrlToRecord(updated, site, {}, site.env),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "open_home_hero_media_upload": {
      const locationId = optionalString(args, "location_id") ?? null;
      const accept = optionalString(args, "accept") ?? "both";
      return renderStructuredResponse(
        {
          launched: true,
          resourceUri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
          context: { site_id: site.siteId, location_id: locationId, accept },
        },
        "Media upload widget launched for the homepage hero.",
      );
    }
    case "set_about_story_image":
      try {
        const assetId = requiredString(args, "asset_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: "about",
            changes: { "story.image": assetId },
            location_id: null,
          },
        );
        const hydratedAboutStory = attachViewUrlToRecord(updated, site, {}, site.env);
        const aboutStoryContext = await mutationContextPayload(site);
        return renderStructuredResponse(
          {
            success: true,
            page: "about",
            changes_count: 1,
            public_path: updated.public_path,
            view_url: hydratedAboutStory.view_url,
            context: aboutStoryContext,
          },
          "Updated About page story image.",
          { page_content: hydratedAboutStory },
        );
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_story_image":
      try {
        const assetId = requiredString(args, "asset_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: "home",
            changes: { "story.image": assetId },
            location_id: null,
          },
        );
        const hydratedHomeStory = attachViewUrlToRecord(updated, site, {}, site.env);
        const homeStoryContext = await mutationContextPayload(site);
        return renderStructuredResponse(
          {
            success: true,
            page: "home",
            changes_count: 1,
            public_path: updated.public_path,
            view_url: hydratedHomeStory.view_url,
            context: homeStoryContext,
          },
          "Updated homepage story image.",
          { page_content: hydratedHomeStory },
        );
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

import type { McpExecutorContext } from './shared'
import { applyBookingPolicyPatch, getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, upsertBookingPolicy, validateBookingPolicyPatch, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'
import { deleteContentField, getEditorContent, updateHomeHero, updatePageContent } from '~/server/utils/mcp-workflows'
import { getMediaAsset } from '~/server/utils/media-asset-manager'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { NOT_HANDLED, getCurrentHomeHeroState, mutationContextPayload, objectRecord, optionalString, requireActiveImageAsset, requireActiveVideoAsset, requiredString, rethrowAsInvalidParams } from './shared'

export async function handleContentTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_page_fields":
      console.info(
        "[MCP] get_page_fields invoked page=%s site=%s",
        args.page,
        site.siteId,
      );
      return await getEditorContent(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "page"),
        optionalString(args, "location_id") ?? undefined,
      );
    case "update_page_content":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: requiredString(args, "page"),
            changes: objectRecord(args.changes, "changes"),
            location_id: locationId,
          },
        );
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
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
      const policy = await upsertBookingPolicy(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        policyType,
        scopeType,
        locationId,
        experienceId,
        patch: await validateBookingPolicyPatch(args as Record<string, unknown>, policyType),
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
        context: await mutationContextPayload(site, { locationId }),
      };
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
          ...updated,
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
          ...update,
          asset_id: assetId,
          public_url: asset?.public_url ?? null,
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
          ...updated,
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
          ...updated,
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
          ...updated,
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
        return {
          ...updated,
          context: await mutationContextPayload(site),
        };
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
        return {
          ...updated,
          context: await mutationContextPayload(site),
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
          ...result,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    default:
      return NOT_HANDLED
  }
}

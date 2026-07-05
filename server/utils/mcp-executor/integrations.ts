import type { McpExecutorContext } from './shared'
import { buildDashboardUrl } from '~/server/utils/dashboard-links'
import { createError } from 'h3'
import { getFacebookPages, getFacebookPagesConnection, getPageInfo, publishToPage, storeFacebookPagesConnection, syncPageInfoToLocation } from '~/server/utils/facebook-pages'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { NOT_HANDLED, mutationContextPayload, optionalString, requiredString } from './shared'

export async function handleIntegrationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "get_facebook_connection": {
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection) {
        return {
          connected: false,
          connectUrl: buildDashboardUrl(site, "settings.general"),
        };
      }
      return {
        connected: true,
        facebook_page_id: connection.facebook_page_id ?? null,
        facebook_page_name: connection.facebook_page_name ?? null,
        status: connection.status,
      };
    }
    case "publish_to_facebook": {
      const allowed = await hasSiteEntitlement(
        site.db,
        site.siteId,
        "managed_service",
      );
      if (!allowed) {
        throw createError({
          statusCode: 403,
          statusMessage:
            "Facebook publishing is included in the Managed plan and above.",
        });
      }
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection)
        throw createError({
          statusCode: 404,
          statusMessage:
            "No Facebook connection found. Connect Facebook from the dashboard first.",
        });
      if (!connection.facebook_page_id || !connection.encrypted_page_token) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "No Facebook Page selected. Sync a page from the dashboard first.",
        });
      }
      const result = await publishToPage(
        connection.encrypted_page_token,
        connection.facebook_page_id,
        {
          message: requiredString(args, "message"),
          link: optionalString(args, "link") ?? undefined,
          published: args.published !== false,
        },
      );
      return {
        success: true,
        post_id: result.id,
        page_name: connection.facebook_page_name,
        context: await mutationContextPayload(site),
      };
    }
    case "sync_facebook_page": {
      const allowed = await hasSiteEntitlement(
        site.db,
        site.siteId,
        "managed_service",
      );
      if (!allowed) {
        throw createError({
          statusCode: 403,
          statusMessage:
            "Facebook sync is included in the Managed plan and above.",
        });
      }
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection)
        throw createError({
          statusCode: 404,
          statusMessage:
            "No Facebook connection found. Connect Facebook from the dashboard first.",
        });

      const requestedPageId = optionalString(args, "page_id");
      let pageToken = connection.encrypted_page_token;
      let pageId = requestedPageId ?? connection.facebook_page_id;

      if (requestedPageId && requestedPageId !== connection.facebook_page_id) {
        const pages = await getFacebookPages(connection.encrypted_user_token);
        const selected = pages.find((p) => p.id === requestedPageId);
        if (!selected)
          throw createError({
            statusCode: 404,
            statusMessage: "Page not found in this connection.",
          });
        pageToken = selected.access_token;
        pageId = selected.id;
        await storeFacebookPagesConnection(site.env as never, {
          ...connection,
          facebook_page_id: selected.id,
          facebook_page_name: selected.name,
          encrypted_user_token: connection.encrypted_user_token,
          encrypted_page_token: pageToken,
          status: "active",
        });
      }

      if (!pageToken || !pageId) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "No Facebook Page selected. Pass page_id or sync a page from the dashboard first.",
        });
      }

      const pageInfo = await getPageInfo(pageToken, pageId);
      const locationId = optionalString(args, "location_id");
      if (locationId) {
        await syncPageInfoToLocation(
          site.env as never,
          pageInfo,
          connection.id,
          site.organizationId,
          site.siteId,
          locationId,
        );
      }

      return {
        success: true,
        synced_to_location: !!locationId,
        page: {
          id: pageInfo.id,
          name: pageInfo.name,
          about: pageInfo.about ?? null,
          phone: pageInfo.phone ?? null,
          website: pageInfo.website ?? null,
          city: pageInfo.location?.city ?? null,
          fan_count: pageInfo.fan_count ?? null,
          cover: pageInfo.cover?.source ?? null,
          picture: pageInfo.picture?.data?.url ?? null,
        },
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    default:
      return NOT_HANDLED
  }
}

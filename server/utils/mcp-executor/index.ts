import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { getMcpTool } from '~/server/utils/mcp-tools'
import { requireMcpSite, requireMcpUser, type McpUserContext } from '~/server/utils/mcp-auth'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { validateArguments } from '~/server/utils/mcp-tool-validation'
import { listSitesForUser } from '~/server/utils/mcp-workflows'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { handleAnalyticsTools } from './analytics'
import { handleBlogTools } from './blog'
import { handleContentTools } from './content'
import { handleExperiencesTools } from './experiences'
import { handleLocalesTools } from './locales'
import { handleLocationsTools } from './locations'
import { handleMediaTools } from './media'
import { handleProductsTools } from './products'
import { handleOnboardingTools } from './onboarding'
import { handlePostsTools } from './posts'
import { handleQaTools } from './qa'
import { handleReviewsTools } from './reviews'
import { handleSettingsTools } from './settings'
import { handleSitesTools } from './sites'
import { handleSubmissionsTools } from './submissions'
import {
  NOT_HANDLED,
  humanizeEntitlement,
  normalizeWorkspaceArguments,
  resolveGoogleMapsPlace,
  resolveSitePublicOrigin,
  validateRequiredArguments,
  workspaceContextPayload,
  workspaceLocationsPayload,
  workspaceOrganizationsPayload,
  workspaceSitesPayload,
} from './shared'
import type { McpExecutorContext } from './shared'

// Exported so non-MCP callers (chowbot-adapter.ts) dispatch through the same
// domain-handler registry instead of hand-copying it — one list of which
// domain owns which tool, not two.
export const DOMAIN_HANDLERS: Record<string, (_ctx: McpExecutorContext) => Promise<unknown>> = {
  analytics: handleAnalyticsTools,
  blog: handleBlogTools,
  content: handleContentTools,
  experiences: handleExperiencesTools,
  locales: handleLocalesTools,
  locations: handleLocationsTools,
  media: handleMediaTools,
  products: handleProductsTools,
  onboarding: handleOnboardingTools,
  posts: handlePostsTools,
  qa: handleQaTools,
  reviews: handleReviewsTools,
  settings: handleSettingsTools,
  sites: handleSitesTools,
  submissions: handleSubmissionsTools,
}

export async function executeMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
  authenticatedUser?: McpUserContext,
) {
  const tool = getMcpTool(toolName);
  if (!tool) {
    throw mcpProtocolError(
      MCP_ERROR.methodNotFound,
      `Unknown tool: ${toolName}`,
      { unknownToolName: toolName },
      'protocol',
    );
  }

  validateArguments(tool.inputSchema, rawArguments);

  const normalizedArguments = await normalizeWorkspaceArguments(
    event,
    toolName,
    tool.inputSchema,
    rawArguments,
    authenticatedUser,
  );

  validateRequiredArguments(tool.inputSchema, normalizedArguments);

  if (toolName === "list_sites") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const allSites = await listSitesForUser(
      user.db,
      user.env,
      user.userId,
    );
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
    );
    const workspaceSitesById = new Map(workspace.sites.map((site) => [site.id, site] as const));
    const sites = allSites.map((s: Record<string, unknown>) => ({
      id: s.id,
      organizationId: s.organization_id,
      organizationName: workspaceSitesById.get(String(s.id))?.organization_name ?? null,
      name: s.brand_name ?? s.slug,
      subdomain: s.subdomain,
      orgSlug: s.slug,
      publicUrl: resolveSitePublicOrigin({
        public_url: typeof s.public_url === 'string' ? s.public_url : null,
        custom_domain: typeof s.custom_domain === 'string' ? s.custom_domain : null,
        subdomain: typeof s.subdomain === 'string' ? s.subdomain : null,
      }, user.env),
      status: s.status ?? "inactive",
      active: s.id === workspace.site?.id,
    }));
    const currentUser = {
      id: user.userId,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    const page = paginateMcpCollection(sites, rawArguments, { resource: `sites:${user.userId}` });
    return renderStructuredResponse(
      { sites: page.items, currentUser, page_info: page.page_info },
      sites.length === 0
        ? "Welcome to KrabiClaw. You have no sites yet — let's create one."
        : `You have ${sites.length} site${sites.length > 1 ? "s" : ""}: ${sites.map((s: { name: unknown }) => s.name).join(", ")}.`,
    );
  }

  if (toolName === "get_workspace_context") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
    );
    const env = cloudflareEnv(event) as { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string };
    return {
      context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location, env),
      organizations: workspaceOrganizationsPayload(workspace),
      sites: workspaceSitesPayload(workspace, env),
      locations: workspaceLocationsPayload(workspace),
    };
  }

  if (toolName === "set_workspace_context") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const organizationId = optionalString(normalizedArguments, "organization_id");
    const siteId = optionalString(normalizedArguments, "site_id");
    const locationId = optionalString(normalizedArguments, "location_id");
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        user.db,
        user.env,
        user.userId,
        {
          organizationId,
          siteId,
          locationId,
          requireSite: Boolean(siteId) || Boolean(locationId),
          requireLocation: Boolean(locationId),
        },
      );
      if (!workspace.organization && !workspace.site && !workspace.location) {
        throw new Error("Workspace context is empty. At least one of organization, site, or location must be resolved.");
      }
    } catch (error) {
      rethrowWorkspaceError(error);
    }

    await upsertMcpWorkspacePreference(user.db, {
      userId: user.userId,
      organizationId: workspace.site?.organization_id ?? workspace.organization?.id ?? null,
      siteId: workspace.site?.id ?? null,
      locationId: workspace.location?.id ?? null,
    });

    const refreshed = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
      {
        organizationId: workspace.organization?.id ?? null,
        siteId: workspace.site?.id ?? null,
        locationId: workspace.location?.id ?? null,
      },
    );
    const env = cloudflareEnv(event) as { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string };

    return {
      success: true,
      context: workspaceContextPayload(refreshed.organization, refreshed.site, refreshed.location, env),
      organizations: workspaceOrganizationsPayload(refreshed),
      sites: workspaceSitesPayload(refreshed, env),
      locations: workspaceLocationsPayload(refreshed),
    };
  }

  if (toolName === "import_from_maps") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const apiKey = (user.env as Record<string, unknown>)
      .GOOGLE_PLACES_API_KEY as string | undefined;
    if (!apiKey)
      throw mcpProtocolError(
        MCP_ERROR.internal,
        "Google Places API not configured.",
      );

    const rawUrl = requiredString(normalizedArguments, "maps_url");

    const { placeId } = await resolveGoogleMapsPlace(rawUrl, {
      resolveShortLink: async (url) => {
        const response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        return { ok: response.ok, url: response.url };
      },
      searchPlaces: async (query, locationBias) => {
        const results = await searchPlaces(apiKey, query, locationBias);
        await chargeFlatCreditsForUser(user, "google_places_search");
        return results;
      },
    });
    let details;
    try {
      details = await getPlaceDetails(apiKey, placeId);
    } catch (error) {
      const message =
        error instanceof PlaceDetailsError || error instanceof Error
          ? error.message
          : "Google Places detail lookup failed.";
      throw new HTTPError({
        statusCode: 502,
        statusMessage: message,
      });
    }
    await chargeFlatCreditsForUser(user, "google_places_details");

    const structuredContent = {
      business: {
        name: details.name,
        address: details.formattedAddress,
        phone: details.phone,
        hours: details.openingHours ?? [],
        rating: details.rating,
        reviewCount: details.ratingCount,
        placeId: details.placeId,
        mapsUrl: details.mapsUrl ?? rawUrl,
      },
    };

    return renderStructuredResponse(
      structuredContent,
      `Imported: ${details.name} — ${details.formattedAddress}.`,
    );
  }

  if (toolName === "show_generated_images") {
    if (!authenticatedUser) await requireMcpUser(event);
    const raw = objectArray(normalizedArguments.images, "images");
    if (raw.length === 0) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "images must be non-empty. First persist each image with save_generated_image or save_generated_image_file, then pass the asset_id and public_url here.",
      );
    }
    for (const img of raw) {
      if (
        typeof img.asset_id !== "string" ||
        !img.asset_id ||
        typeof img.public_url !== "string" ||
        !img.public_url
      ) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Each image must have a non-empty asset_id and public_url returned by save_generated_image or save_generated_image_file.",
        );
      }
    }
    const images = raw.map((img) => ({
      asset_id: img.asset_id as string,
      public_url: img.public_url as string,
    }));

    let activeSiteName: string | null = null;
    let activeSiteContext: Awaited<ReturnType<typeof requireMcpSite>> | null = null;
    const rawSiteId = optionalString(normalizedArguments, "site_id");
    const rawTargetForName = optionalString(normalizedArguments, "target");
    if (rawTargetForName && rawSiteId) {
      activeSiteContext = await requireMcpSite(event, rawSiteId, "editor", authenticatedUser);
      const siteRow = await queryFirst<{ brand_name: string | null; subdomain: string | null }>(
        activeSiteContext.db,
        `
          SELECT brand_name, subdomain
          FROM sites
          WHERE id = ? AND organization_id = ?
          LIMIT 1
        `,
        [activeSiteContext.siteId, activeSiteContext.organizationId],
      );
      const nameVal = siteRow?.brand_name?.trim();
      activeSiteName = (nameVal ? nameVal : siteRow?.subdomain) ?? null;
    }

    const picker = pickerConfigFromShowGeneratedImages(normalizedArguments, activeSiteName);
    const isDebug = normalizedArguments.debug === true;
    return renderStructuredResponse(
      {
        title: picker.title,
        subtitle: picker.subtitle,
        images,
        useLabel: picker.useLabel,
        regenerateLabel: picker.regenerateLabel,
        assignTool: picker.assignTool,
        assignArgs: picker.assignArgs,
        regenerateTool: picker.regenerateTool,
        regenerateArgs: picker.regenerateArgs,
        successMessage: picker.successMessage,
        ...(isDebug ? {
          debug: true,
          debugLabel: "show_generated_images debug",
          debugExpectedImageDomain: "https://imagedelivery.net",
        } : {}),
      },
      `${images.length} AI-generated image${images.length !== 1 ? "s" : ""} ready to review.`,
    );
  }

  if (toolName === "create_site") {
    const user = authenticatedUser ?? await requireMcpUser(event);
    const result = await runSiteCreation(user.env, user.db, user.userId, {
      name: requiredString(normalizedArguments, "name"),
      subdomain: requiredString(normalizedArguments, "subdomain"),
      vertical: requiredString(normalizedArguments, "vertical") as SiteVertical,
    });
    assertDomainSuccess(result);
    const normalized = normalizeSiteCreationData(result.data);
    const createdSite = await resolveMcpWorkspace(
      user.db,
      user.env,
      user.userId,
      { siteId: normalized.siteId, requireSite: true },
    );
    await upsertMcpWorkspacePreference(user.db, {
      userId: user.userId,
      organizationId: createdSite.site?.organization_id ?? null,
      siteId: createdSite.site?.id ?? normalized.siteId,
      locationId: createdSite.location?.id ?? null,
    });
    return normalized;
  }

  const siteId = requiredString(normalizedArguments, "site_id");
  const site = await requireMcpSite(event, siteId, tool.minimumRole, authenticatedUser);
  const args = omit(normalizedArguments, ["site_id"]);
  const explicitLocationId = optionalString(rawArguments, "location_id");
  if (explicitLocationId) {
    const location = await queryFirst<{ id: string }>(site.db, `
      SELECT id
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [explicitLocationId, site.organizationId, site.siteId]);
    if (!location) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "Location not found for this site.");
    }
  }

  if (
    tool.requiredEntitlement &&
    !(await hasSiteEntitlement(
      site.db,
      site.siteId,
      tool.requiredEntitlement,
    ))
  ) {
    throw new HTTPError({
      statusCode: 403,
      statusMessage: `${humanizeEntitlement(tool.requiredEntitlement)} is not enabled for this site.`,
    });
  }

  const domainHandler = tool.domain ? DOMAIN_HANDLERS[tool.domain] : undefined;
  if (domainHandler) {
    const result = await domainHandler({ event, toolName, rawArguments, normalizedArguments, tool, siteId, site, args });
    if (result !== NOT_HANDLED) return result;
  }
  throw mcpProtocolError(
        MCP_ERROR.methodNotFound,
        `Unhandled tool: ${toolName}`,
      );
}

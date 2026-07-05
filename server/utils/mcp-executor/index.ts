import type { H3Event } from 'h3'
import { queryFirst } from '~/server/db'
import { handleAnalyticsTools } from './analytics'
import { handleBlogTools } from './blog'
import { handleContentTools } from './content'
import { handleExperiencesTools } from './experiences'
import { handleGoogleBusinessTools } from './google-business'
import { handleIntegrationsTools } from './integrations'
import { handleLocalesTools } from './locales'
import { handleLocationsTools } from './locations'
import { handleManagedServiceTools } from './managed-service'
import { handleMediaTools } from './media'
import { handleMenusTools } from './menus'
import { handleNotificationsTools } from './notifications'
import { handleOnboardingTools } from './onboarding'
import { handlePostsTools } from './posts'
import { handleQaTools } from './qa'
import { handleReviewsTools } from './reviews'
import { handleSettingsTools } from './settings'
import { handleSitesTools } from './sites'
import { handleSubmissionsTools } from './submissions'
import { handleTranslationsTools } from './translations'
import { NOT_HANDLED } from './shared'
import type { McpExecutorContext } from './shared'

const DOMAIN_HANDLERS: Record<string, (ctx: McpExecutorContext) => Promise<unknown>> = {
  analytics: handleAnalyticsTools,
  blog: handleBlogTools,
  content: handleContentTools,
  experiences: handleExperiencesTools,
  google_business: handleGoogleBusinessTools,
  integrations: handleIntegrationsTools,
  locales: handleLocalesTools,
  locations: handleLocationsTools,
  managed_service: handleManagedServiceTools,
  media: handleMediaTools,
  menus: handleMenusTools,
  notifications: handleNotificationsTools,
  onboarding: handleOnboardingTools,
  posts: handlePostsTools,
  qa: handleQaTools,
  reviews: handleReviewsTools,
  settings: handleSettingsTools,
  sites: handleSitesTools,
  submissions: handleSubmissionsTools,
  translations: handleTranslationsTools,
}

export async function executeMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
) {
  const tool = getMcpTool(toolName);
  if (!tool) {
    throw mcpProtocolError(
      MCP_ERROR.methodNotFound,
      `Unknown tool: ${toolName}`,
    );
  }

  const normalizedArguments = await normalizeWorkspaceArguments(
    event,
    toolName,
    tool.inputSchema,
    rawArguments,
  );

  validateRequiredArguments(tool.inputSchema, normalizedArguments);

  if (toolName === "list_sites") {
    const user = await requireMcpUser(event);
    const userRecord = await queryFirst<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
    }>(user.db, `SELECT id, email, name, role FROM user WHERE id = ? LIMIT 1`, [user.userId]);
    const allSites = await listSitesForUser(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    const workspaceSitesById = new Map(workspace.sites.map((site) => [site.id, site] as const));
    const sites = allSites.map((s: Record<string, unknown>) => ({
      id: s.id,
      organizationId: s.organization_id,
      organizationName: workspaceSitesById.get(String(s.id))?.organization_name ?? null,
      name: s.brand_name ?? s.slug,
      subdomain: s.subdomain,
      orgSlug: s.slug,
      publicUrl: s.subdomain ? `https://${s.subdomain}.krabiclaw.com` : null,
      status: s.status ?? "draft",
      active: s.id === workspace.site?.id,
    }));
    const currentUser = {
      id: user.userId,
      email: userRecord?.email ?? null,
      name: userRecord?.name ?? null,
      role: userRecord?.role ?? null,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    return renderStructuredResponse(
      { sites, currentUser },
      sites.length === 0
        ? "Welcome to KrabiClaw. You have no sites yet — let's create one."
        : `You have ${sites.length} site${sites.length > 1 ? "s" : ""}: ${sites.map((s: { name: unknown }) => s.name).join(", ")}.`,
    );
  }

  if (toolName === "get_current_user") {
    const user = await requireMcpUser(event);
    const currentUser = await queryFirst<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
    }>(
      user.db,
      `
        SELECT id, email, name, role
        FROM user
        WHERE id = ?
        LIMIT 1
      `,
      [user.userId],
    );

    if (!currentUser) {
      throw createError({
        statusCode: 404,
        statusMessage: "Current user not found",
      });
    }

    return {
      user: {
        ...currentUser,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }

  if (toolName === "get_workspace_context") {
    const user = await requireMcpUser(event);
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    return {
      context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
      organizations: workspaceOrganizationsPayload(workspace),
      sites: workspaceSitesPayload(workspace),
      locations: workspaceLocationsPayload(workspace),
    };
  }

  if (toolName === "set_workspace_context") {
    const user = await requireMcpUser(event);
    const organizationId = optionalString(normalizedArguments, "organization_id");
    const siteId = optionalString(normalizedArguments, "site_id");
    const locationId = optionalString(normalizedArguments, "location_id");
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        user.db,
        user.userId,
        user.isPlatformAdmin,
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
      user.userId,
      user.isPlatformAdmin,
      {
        organizationId: workspace.organization?.id ?? null,
        siteId: workspace.site?.id ?? null,
        locationId: workspace.location?.id ?? null,
      },
    );

    return {
      success: true,
      context: workspaceContextPayload(refreshed.organization, refreshed.site, refreshed.location),
      organizations: workspaceOrganizationsPayload(refreshed),
      sites: workspaceSitesPayload(refreshed),
      locations: workspaceLocationsPayload(refreshed),
    };
  }

  if (toolName === "import_from_maps") {
    const user = await requireMcpUser(event);
    const apiKey = (user.env as Record<string, unknown>)
      .GOOGLE_PLACES_API_KEY as string | undefined;
    if (!apiKey)
      throw mcpProtocolError(
        MCP_ERROR.internal,
        "Google Places API not configured.",
      );

    const rawUrl = requiredString(normalizedArguments, "maps_url");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid Maps URL.");
    }

    if (!isAllowedGoogleMapsHost(parsedUrl.hostname)) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "URL does not appear to be a Google Maps link. Please paste a google.com/maps or maps.app.goo.gl link.",
      );
    }

    const hint = (normalizedArguments.parsed_hint ?? null) as ParsedHint | null;
    const policy = resolveMatchingPolicy(normalizedArguments.matching_policy);

    // Resolve short URLs (maps.app.goo.gl).
    // Use redirect:follow GET instead of redirect:manual HEAD —
    // Cloudflare Workers blocks manual redirect fetches against goo.gl.
    let resolvedUrl = parsedUrl.toString();
    if (parsedUrl.hostname === "maps.app.goo.gl") {
      try {
        const probe = await fetch(parsedUrl.toString(), {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (probe.url && isAllowedGoogleMapsHost(new URL(probe.url).hostname)) {
          resolvedUrl = probe.url;
        }
      } catch {
        /* keep original — will fall through to text search below */
      }
    }

    // Backend is parser of record. Extract signals deterministically from the resolved URL.
    const backendParsed = extractGoogleMapsSignals(resolvedUrl);

    // If a hint was provided, warn when it diverges from backend extraction (>1 km).
    // Hint is informational only — backend extraction takes precedence.
    if (
      hint?.lat != null &&
      hint?.lng != null &&
      backendParsed.lat != null &&
      backendParsed.lng != null
    ) {
      const divergenceKm = haversineKm(
        hint.lat,
        hint.lng,
        backendParsed.lat,
        backendParsed.lng,
      );
      if (divergenceKm > 1) {
        console.warn(
          "[import_from_maps] parsed_hint diverges from backend extraction",
          {
            hint: { lat: hint.lat, lng: hint.lng },
            backendParsed: { lat: backendParsed.lat, lng: backendParsed.lng },
            divergenceKm: Math.round(divergenceKm * 10) / 10,
          },
        );
      }
    }

    // Use backend extraction as authoritative. Fall back to hint only for fields the
    // backend could not extract (e.g. a short link that failed to resolve).
    const nameHint = backendParsed.nameHint ?? hint?.name_hint ?? null;
    const lat = backendParsed.lat ?? (hint?.lat != null ? hint.lat : null);
    const lng = backendParsed.lng ?? (hint?.lng != null ? hint.lng : null);
    const { rawId, isHexCid, isChijId } = backendParsed;

    let placeId: string | null = null;

    if (isChijId) {
      // Best case — proper ChIJ ID directly from URL
      placeId = rawId;
    } else if (isHexCid || !rawId) {
      // Hex CID or no ID — resolve via coordinate-biased text search
      if (!nameHint) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Could not extract place details from that Maps URL. Try copying the full Google Maps URL from the address bar.",
        );
      }
      if (!policy.allow_name_only_fallback && lat == null) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "This URL does not contain location coordinates. Paste the full Google Maps URL from the address bar so the place can be identified precisely.",
        );
      }
      const locationBias =
        lat != null && lng != null
          ? { latitude: lat, longitude: lng }
          : undefined;
      let results;
      try {
        results = await searchPlaces(apiKey, nameHint, locationBias);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Google Places search failed.";
        throw createError({
          statusCode: 502,
          statusMessage: message,
        });
      }
      await chargeFlatCreditsForUser(user, "google_places_search");
      const candidate = results[0];
      if (!candidate?.placeId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Could not find "${nameHint}" in Google Places. Try the full Maps URL from the address bar.`,
        );
      }
      if (
        policy.require_coordinate_match &&
        locationBias &&
        candidate.lat != null &&
        candidate.lng != null
      ) {
        const distKm = haversineKm(
          locationBias.latitude,
          locationBias.longitude,
          candidate.lat,
          candidate.lng,
        );
        if (distKm > policy.max_distance_km) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            `The top search result for "${nameHint}" is ${Math.round(distKm)} km from the location in that URL. Paste the full Google Maps URL from the address bar so the exact place can be identified.`,
          );
        }
      }
      placeId = candidate.placeId;
    } else {
      // Non-ChIJ, non-hex — try it directly; Places API will 404 if invalid
      placeId = rawId;
    }

    if (!placeId)
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "Could not resolve a place ID from that URL.",
      );
    let details;
    try {
      details = await getPlaceDetails(apiKey, placeId, true);
    } catch (error) {
      const message =
        error instanceof PlaceDetailsError || error instanceof Error
          ? error.message
          : "Google Places detail lookup failed.";
      throw createError({
        statusCode: 502,
        statusMessage: message,
      });
    }
    await chargeFlatCreditsForUser(user, "google_places_details");

    // Upload Google Photos to Cloudflare Images for stable preview URLs.
    // We don't have an org/site yet, so we do NOT persist media_asset rows here.
    // The returned cfImageId lets the model create proper media_assets after create_site.
    const photos: Array<{ cfImageId: string; publicUrl: string }> = [];
    const hasImagesConfig = hasCloudflareImagesConfig(user.env);

    if (hasImagesConfig && details.photos.length > 0) {
      for (const photo of details.photos.slice(0, 10)) {
        try {
          const imgRes = await fetch(photo.photoUri, {
            signal: AbortSignal.timeout(15000),
          });
          if (!imgRes.ok) continue;
          const contentLength = Number(imgRes.headers.get("content-length"));
          if (contentLength > 10 * 1024 * 1024) continue;
          const buffer = await imgRes.arrayBuffer();
          if (buffer.byteLength > 10 * 1024 * 1024) continue;
          const contentType =
            imgRes.headers.get("content-type") ?? "image/jpeg";
          const uploaded = await uploadImageBuffer(
            user.env as Parameters<typeof uploadImageBuffer>[0],
            buffer,
            `maps-photo-${placeId}-${photos.length}.jpg`,
            contentType,
          );
          photos.push({
            cfImageId: uploaded.imageId,
            publicUrl: uploaded.publicUrl,
          });
        } catch {
          /* skip failed photos */
        }
      }
    }

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
      photos,
      missingPhotos: photos.length < 3,
    };

    return renderStructuredResponse(
      structuredContent,
      `Imported: ${details.name} — ${details.formattedAddress}. ${photos.length} photo${photos.length !== 1 ? "s" : ""} found.`,
    );
  }

  if (toolName === "show_generated_images") {
    await requireMcpUser(event);
    const raw = objectArray(normalizedArguments.images, "images");
    if (raw.length === 0) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "images must be non-empty. First persist each image with save_generated_image or save_generated_image_file, then pass the assetId and publicUrl here.",
      );
    }
    for (const img of raw) {
      if (
        typeof img.assetId !== "string" ||
        !img.assetId ||
        typeof img.publicUrl !== "string" ||
        !img.publicUrl
      ) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Each image must have a non-empty assetId and publicUrl returned by save_generated_image or save_generated_image_file.",
        );
      }
    }
    const images = raw.map((img) => ({
      assetId: img.assetId as string,
      publicUrl: img.publicUrl as string,
    }));

    let activeSiteName: string | null = null;
    const rawSiteId = optionalString(normalizedArguments, "site_id");
    const rawTargetForName = optionalString(normalizedArguments, "target");
    if (rawTargetForName && rawSiteId) {
      const authorizedSite = await requireMcpSite(event, rawSiteId, "editor");
      const siteRow = await queryFirst<{ brand_name: string | null; subdomain: string | null }>(
        authorizedSite.db,
        `
          SELECT brand_name, subdomain
          FROM sites
          WHERE id = ? AND organization_id = ?
          LIMIT 1
        `,
        [authorizedSite.siteId, authorizedSite.organizationId],
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
    const user = await requireMcpUser(event);
    const result = await runSiteCreation(user.env, user.db, user.userId, {
      name: requiredString(normalizedArguments, "name"),
      subdomain: requiredString(normalizedArguments, "subdomain"),
      vertical: requiredString(normalizedArguments, "vertical") as SiteVertical,
    });
    assertDomainSuccess(result);
    const normalized = normalizeSiteCreationData(result.data);
    const createdSite = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
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
  const site = await requireMcpSite(event, siteId, tool.minimumRole);
  const args = omit(normalizedArguments, ["site_id"]);
  const explicitSiteId = optionalString(rawArguments, "site_id");
  const explicitLocationId = optionalString(rawArguments, "location_id");

  if (explicitSiteId || explicitLocationId) {
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        site.db,
        site.userId,
        site.isPlatformAdmin,
        {
          siteId: site.siteId,
          locationId: explicitLocationId,
          requireSite: true,
          requireLocation: Boolean(explicitLocationId),
        },
      );
    } catch (error) {
      rethrowWorkspaceError(error);
    }
    await upsertMcpWorkspacePreference(site.db, {
      userId: site.userId,
      organizationId: workspace.site?.organization_id ?? site.organizationId,
      siteId: workspace.site?.id ?? site.siteId,
      locationId: workspace.location?.id ?? null,
    });
  }

  if (
    tool.requiredEntitlement &&
    !(await hasSiteEntitlement(
      site.db,
      site.siteId,
      tool.requiredEntitlement,
    ))
  ) {
    throw createError({
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

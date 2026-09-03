import {
  callAiGateway,
  type AiMessage,
} from "~/server/utils/ai-gateway";
import { hasCredits, chargeCredits } from "~/server/utils/ai-credits";
import { runMcpExecutorToolForChowbot } from "~/server/utils/mcp-executor/chowbot-adapter";
import { normalizeRole } from "~/server/utils/mcp-auth";
import { setConfig } from "~/server/utils/site-config";
import { getPlaceDetails, searchPlaces } from "~/server/utils/google-places";
import { upsertChannelState } from "~/server/utils/chowbot-conversations";
import { CHOWBOT_MODEL } from "~/server/utils/ai-models";
import { updateSiteSettingsFields } from "~/server/utils/site-settings";
import {
  getExperienceById,
  WEEKDAY_NAMES,
} from "~/server/utils/experiences";
import {
  CHOWBOT_TOOLS,
  CHOWBOT_CONFIRM_REQUIRED,
} from "~/server/utils/chowbot-tools";
import {
  assertConversationalToolEnabled,
  filterConversationalTools,
  isConversationalToolGroupEnabled,
  normalizeChowBotToolForConversationalSurface,
} from "~/server/utils/conversational-tool-surface";
import { queryAll, queryFirst } from "~/server/db";
import { searchPublicResources } from "~/server/utils/public-search";
import { PUBLIC_SEARCH_TYPES, type PublicSearchTypeFilter } from '~/server/utils/platform-search-types'
import { findOrganizationById } from '~/server/utils/member-access'

const MAX_ITERATIONS = 10;
export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

export interface ChowBotIncomingMessage {
  role: "user" | "assistant";
  content: string | JsonSerializable;
}

export interface ChowBotToolCall {
  name: string;
  input: JsonSerializable;
  result: JsonSerializable;
}

export interface ChowBotRunEvent {
  type: "tool_start" | "tool_done" | "text" | "done" | "error";
  name?: string;
  content?: string;
  message?: string;
  toolCalls?: ChowBotToolCall[];
  creditsRemaining?: number | null;
}

export interface RunChowBotOptions {
  db: D1Database;
  env: ApiRecord;
  orgId: string;
  siteId: string;
  userId: string;
  memberId: string;
  userRole?: string;
  siteName: string;
  defaultCurrency: string;
  messages: ChowBotIncomingMessage[];
  currentPage?: string;
  locationId?: string | null;
  channel?: "dashboard" | "whatsapp";
  sessionId?: string | null;
  pendingMedia?: { assetId: string; siteId: string };
  onEvent?: (_event: ChowBotRunEvent) => Promise<void> | void;
}

export interface RunChowBotResult {
  responseText: string;
  toolCalls: ChowBotToolCall[];
  creditsRemaining: number | null;
}

interface StatusCountRow {
  status: string;
  count: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toSqlText(value: ApiValue): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function isAllowedGoogleMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    host === "maps.google.com" ||
    host === "google.com" ||
    host.endsWith(".google.com")
  );
}

function requiresConfirmation(
  name: string,
  recentMessages: AiMessage[],
): boolean {
  if (!CHOWBOT_CONFIRM_REQUIRED.has(name)) return false;
  const CONFIRM_WORDS =
    /\b(yes|yea|yeah|yep|yup|ok|okay|go ahead|do it|do that|publish|confirm|proceed|sure|absolutely|fine|sounds good|let'?s go)\b/i;
  const userTurns = recentMessages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => (typeof m.content === "string" ? m.content : ""));
  return !userTurns.some((t) => CONFIRM_WORDS.test(t));
}

async function executeTool(
  name: string,
  input: ApiRecord,
  ctx: {
    db: D1Database;
    env: ApiRecord;
    orgId: string;
    siteId: string;
    userId: string;
    memberId: string;
    userRole?: string;
    agentMessages?: AiMessage[];
    locationId?: string | null;
    channel?: "dashboard" | "whatsapp";
    sessionId?: string | null;
    pendingMedia?: { assetId: string; siteId: string };
  },
): Promise<ApiValue> {
  const { db, env, orgId, siteId, userId } = ctx;
  // normalizeRole rejects anything that isn't exactly 'owner'/'admin'/'editor'
  // (including undefined). roleSatisfies compares via ROLE_RANK[actual], and
  // ROLE_RANK[anything unrecognized] is undefined — `undefined < N` is always
  // false in JS, so an un-normalized role would fail OPEN (satisfy every
  // minimumRole check) instead of being rejected. Both callers (dashboard
  // agent.post.ts, WhatsApp webhook.post.ts) resolve userRole from a real
  // membership row before invoking runChowBot, so this "can't happen" in
  // practice — but fail closed rather than trust that invariant silently.
  const normalizedRole = normalizeRole(ctx.userRole);
  if (!normalizedRole) {
    return { error: "Could not verify your permissions for this site." };
  }
  const dashboardRouteContext = name === 'get_dashboard_link'
    ? await Promise.all([
        findOrganizationById(env as CloudflareEnv, orgId),
        queryFirst<{ siteSlug: string | null }>(db, `
          SELECT subdomain AS siteSlug FROM sites
          WHERE organization_id = ? AND id = ? LIMIT 1
        `, [orgId, siteId]),
      ]).then(([organization, site]) => organization && site
        ? { organizationSlug: organization.slug, siteSlug: site.siteSlug }
        : null)
    : null;
  const executorSite = {
    db,
    env: env as CloudflareEnv,
    userId,
    memberId: ctx.memberId,
    organizationId: orgId,
    organizationSlug: dashboardRouteContext?.organizationSlug,
    subdomain: dashboardRouteContext?.siteSlug ?? null,
    siteId,
    role: normalizedRole,
    sessionId: ctx.sessionId,
  };

  try {
    assertConversationalToolEnabled(name, env);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : `Tool ${name} is not available.`,
    };
  }

  if (requiresConfirmation(name, ctx.agentMessages ?? [])) {
    return {
      __requires_confirmation: true,
      message: `Please confirm you want to ${name.replace(/_/g, " ")}.`,
    };
  }

  switch (name) {
    // ChowBot-only trim: full post bodies (MCP's list_posts returns them
    // untruncated, unbounded count) would blow up chat context size — cap
    // to 10 posts with a 120-char body preview, same as before migrating.
    case "list_posts": {
      const result = await runMcpExecutorToolForChowbot(executorSite, "list_posts", input) as {
        error?: string;
        posts?: Array<{ id: string; title: string; body: string; status: string; post_type: string; location_id: string | null; updated_at: string }>;
      };
      if (result.error || !result.posts) return result;
      return result.posts.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body.length > 120 ? `${p.body.slice(0, 120)}…` : p.body,
        status: p.status,
        post_type: p.post_type,
        location_id: p.location_id,
        updated_at: p.updated_at,
      }));
    }

    // Regression note: delete_post used to hard-require owner/admin here,
    // but MCP's delete_post has always been minimumRole 'editor' (its
    // description text says "Only owners and admins" but nothing enforces
    // that beyond the role gate — see the existing e2e test asserting
    // owner/admin/editor can all delete via the MCP tool path). The
    // adapter now applies that same, already-tested policy to ChowBot
    // instead of ChowBot's stricter local check.
    case "create_post":
    case "update_post":
    case "delete_post": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "publish_post": {
      return runMcpExecutorToolForChowbot(executorSite, "publish_post", { ...input, channels: ["site"] });
    }

    case "list_location_products":
    case "get_product":
    case "create_product":
    case "update_product":
    case "delete_product":
    case "move_products":
    case "move_product_category":
    case "rename_product_category":
    case "delete_product_category":
    case "batch_create_products":
    case "sync_products": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // Regression note: create_location/update_location's rating/review_count/
    // max_capacity range checks were duplicated here — createLocation/
    // updateLocation already validate the same rules server-side, so this
    // was redundant, not filling a gap.
    case "list_locations":
    case "create_location":
    case "update_location":
    case "delete_location": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "import_from_maps": {
      const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined;
      if (!apiKey) return { error: "Google Places API not configured." };

      const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
      if (!rawUrl) return { error: "url is required." };

      let parsedRawUrl: URL;
      try {
        parsedRawUrl = new URL(rawUrl);
      } catch {
        return { error: "Invalid URL format." };
      }

      if (!isAllowedGoogleMapsHost(parsedRawUrl.hostname)) {
        return { error: "URL does not appear to be a Google Maps link." };
      }

      // Resolve short URLs (maps.app.goo.gl).
      // Use redirect:follow GET instead of redirect:manual HEAD — Cloudflare
      // Workers blocks manual redirect fetches against goo.gl (see the same
      // fix in mcp-executor/index.ts's import_from_maps handling).
      let resolvedUrl = parsedRawUrl.toString();
      if (parsedRawUrl.hostname === "maps.app.goo.gl") {
        try {
          const probe = await fetch(parsedRawUrl.toString(), {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (probe.url && isAllowedGoogleMapsHost(new URL(probe.url).hostname)) {
            resolvedUrl = probe.url;
          }
        } catch {
          /* keep original — falls through to text search below */
        }
      }

      try {
        const resolvedHost = new URL(resolvedUrl).hostname;
        if (!isAllowedGoogleMapsHost(resolvedHost)) {
          return { error: "Resolved URL is not a Google Maps host." };
        }
      } catch {
        return { error: "Resolved URL is invalid." };
      }

      // Extract place ID from the canonical URL data parameter: !1s{placeId}
      const placeIdMatch = resolvedUrl.match(/!1s([^!&]+)/);
      const placeId = placeIdMatch?.[1] ?? null;

      if (placeId) {
        try {
          const details = await getPlaceDetails(apiKey, placeId);
          return {
            found: true,
            name: details.name,
            address: details.formattedAddress,
            city: details.city,
            phone: details.phone,
            website_url: details.websiteUrl,
            maps_url: details.mapsUrl,
            latitude: details.lat,
            longitude: details.lng,
            rating: details.rating,
            opening_hours: details.openingHours,
            hint: "Use update_location with location_id plus the fields above to apply these details.",
          };
        } catch {
          /* fall through to text search */
        }
      }

      // Fallback: extract business name from URL and text-search
      const nameMatch = resolvedUrl.match(/\/maps\/place\/([^/@]+)/);
      const placePath = nameMatch?.[1] ?? "";
      const nameQuery = placePath
        ? decodeURIComponent(placePath.replace(/\+/g, " "))
        : "";
      if (!nameQuery)
        return {
          error:
            "Could not extract a place from that URL. Try sharing the full Google Maps link.",
        };

      const results = await searchPlaces(apiKey, nameQuery);
      if (!results.length)
        return { error: `No places found for "${nameQuery}".` };

      const top = results[0]!;
      return {
        found: true,
        name: top.name,
        address: top.formattedAddress,
        phone: top.phone,
        maps_url: top.mapsUrl,
        latitude: top.lat,
        longitude: top.lng,
        rating: top.rating,
        hint: "Use update_location with location_id plus the fields above to apply these details.",
      };
    }

    // Both delegate to mcp-executor/reviews.ts. reply_to_review is MCP
    // minimumRole 'owner' — the adapter now enforces that (previously
    // ChowBot's own case body had no role check at all).
    case "list_location_reviews":
    case "reply_to_review": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "list_site_reviews":
    case "create_owner_entered_site_review":
    case "update_owner_entered_site_review":
    case "delete_owner_entered_site_review": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_site_media_assets":
    case "delete_media_asset": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "import_products_from_media": {
      const pendingAssetId = ctx.pendingMedia?.siteId === siteId ? ctx.pendingMedia.assetId : undefined;
      const assetId = toSqlText(input.asset_id)?.trim() || pendingAssetId;
      if (!assetId) return { error: "asset_id is required." };
      const result = await runMcpExecutorToolForChowbot(executorSite, name, {
        ...input,
        asset_id: assetId,
      }) as { error?: string; products?: unknown[] };
      if (result.error) return result;
      if (pendingAssetId && ctx.channel === "whatsapp") {
        await upsertChannelState(db, {
          userId,
          channel: "whatsapp",
          selectedSiteId: siteId,
          pendingMessageId: null,
          pendingConfirmation: null,
        });
      }
      return {
        ...result,
        asset_id: assetId,
      };
    }

    case "analyze_document": {
      // Document analysis is read-only — the pending
      // document stays available afterward so the user can ask follow-up
      // questions about the same file without re-uploading it.
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: "No pending WhatsApp document is available to analyze." };
      }
      const result = await runMcpExecutorToolForChowbot(executorSite, "analyze_document", {
        asset_id: ctx.pendingMedia.assetId,
        question: toSqlText(input.question)?.trim() || undefined,
      }) as { error?: string; answer?: string; creditsRemaining?: unknown; stats?: unknown };
      if (result.error) return result;
      return {
        asset_id: ctx.pendingMedia.assetId,
        answer: result.answer,
        credits_remaining: result.creditsRemaining,
        stats: result.stats,
      };
    }

    case "resolve_pending_media": {
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: "No pending WhatsApp media is available to resolve." };
      }
      const action = toSqlText(input.action);
      if (action !== "save_media" && action !== "cancel") {
        return { error: "action must be save_media or cancel." };
      }
      if (ctx.channel === "whatsapp") {
        await upsertChannelState(db, {
          userId,
          channel: "whatsapp",
          selectedSiteId: siteId,
          pendingMessageId: null,
          pendingConfirmation: null,
        });
      }
      return { asset_id: ctx.pendingMedia.assetId, action, resolved: true };
    }

    case "generate_image": {
      const { uploadImageBuffer } =
        await import("~/server/utils/cloudflare-images");
      const { createMediaAsset } =
        await import("~/server/utils/media-asset-manager");
      const { generateImageViaGateway, IMAGE_MODEL } =
        await import("~/server/utils/ai-gateway");
      const generated = await generateImageViaGateway(env, input.prompt);
      const image = generated.images[0];
      if (!image) {
        return { error: "Image generation returned no images." };
      }
      const { imageId, publicUrl, thumbnailUrl } = await uploadImageBuffer(
        env,
        image.imageBuffer,
        image.filename || `chowbot-${Date.now()}.png`,
      );
      const assetId = crypto.randomUUID();
      await createMediaAsset(db, {
        id: assetId,
        organization_id: orgId,
        site_id: siteId,
        kind: "image",
        provider: "cloudflare_images",
        source: "generated",
        cloudflare_image_id: imageId,
        public_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        mime_type: "image/png",
        status: "active",
        created_by_user_id: userId,
      });
      await chargeCredits(db, orgId, {
        siteId,
        sessionId: ctx.sessionId,
        action: "generate_image",
        model: IMAGE_MODEL,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        cfGatewayLogId: generated.cfLogId,
      });
      return { asset_id: assetId, public_url: publicUrl, thumbnail_url: thumbnailUrl };
    }

    case "list_location_qa":
    case "create_location_qa":
    case "delete_location_qa": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "list_site_qa":
    case "create_site_qa":
    case "delete_site_qa": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_contact_inquiries": {
      return runMcpExecutorToolForChowbot(executorSite, "get_contact_inquiries", input);
    }

    case "get_reservation_inquiries": {
      // ChowBot-only convenience: fall back to the dashboard's current page
      // location when the model omits location_id.
      return runMcpExecutorToolForChowbot(executorSite, "get_reservation_inquiries", {
        ...input,
        location_id: input.location_id ?? ctx.locationId,
      });
    }

    case "get_professional_service_content":
      return runMcpExecutorToolForChowbot(executorSite, "get_professional_service_content", input);

    case "update_professional_service_content":
      return runMcpExecutorToolForChowbot(executorSite, "update_professional_service_content", input);

    case "list_tenant_pages":
    case "get_tenant_page":
    case "create_tenant_page":
    case "update_tenant_page":
    case "change_tenant_page_path":
      return runMcpExecutorToolForChowbot(executorSite, name, input);

    case "get_site_stats": {
      const [postStats, productCount, locationCount, reviewCount] =
        await Promise.all([
          queryAll(
            db,
            `SELECT status, COUNT(*) as count FROM posts WHERE organization_id = ? AND site_id = ? GROUP BY status`,
            [orgId, siteId],
          ),
          queryFirst<{ count: number }>(
            db,
            `SELECT COUNT(*) as count FROM products WHERE organization_id = ? AND site_id = ?`,
            [orgId, siteId],
          ),
          queryFirst<{ count: number }>(
            db,
            `SELECT COUNT(*) as count FROM business_locations WHERE organization_id = ? AND site_id = ? AND status = 'active'`,
            [orgId, siteId],
          ),
          queryFirst<{ count: number }>(
            db,
            `SELECT COUNT(*) as count FROM reviews WHERE site_id = ? AND status = 'approved'`,
            [siteId],
          ),
        ]);
      const byStatus = (
        (postStats ?? []) as unknown as StatusCountRow[]
      ).reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {});
      return {
        posts: {
          published: byStatus.published ?? 0,
          scheduled: byStatus.scheduled ?? 0,
        },
        products: productCount?.count ?? 0,
        locations: locationCount?.count ?? 0,
        reviews: reviewCount?.count ?? 0,
      };
    }

    case "rename_site": {
      const result = await updateSiteSettingsFields(
        db,
        env,
        siteId,
        orgId,
        { brand_name: input.brand_name },
        userId,
      );
      if (result.status >= 400) {
        return {
          error: String(result.data.error ?? "Failed to update site settings."),
        };
      }
      const settings =
        result.data.settings && typeof result.data.settings === "object"
          ? (result.data.settings as Record<string, unknown>)
          : null;
      return {
        brand_name: settings?.brand_name ?? input.brand_name,
        subdomain: settings?.subdomain ?? null,
        updated: true,
      };
    }

    case "save_brand_description": {
      const description = toSqlText(input.description)?.trim();
      if (!description) return { error: "Description is required." };
      const result = await updateSiteSettingsFields(
        db,
        env,
        siteId,
        orgId,
        { brand_description: description },
        userId,
      );
      if (result.status >= 400) {
        return {
          error: String(result.data.error ?? "Failed to update site settings."),
        };
      }
      return { brand_description: description, updated: true };
    }

    case "set_default_currency": {
      const currency = toSqlText(input.currency)?.trim().toUpperCase();
      return runMcpExecutorToolForChowbot(executorSite, "set_default_currency", { currency });
    }

    case "update_site_social": {
      type SocialKey =
        | "press_email"
        | "partnerships_email"
        | "catering_email"
        | "careers_email";
      const map: Array<[SocialKey, string | undefined]> = [
        ["press_email", toSqlText(input.press_email) ?? undefined],
        [
          "partnerships_email",
          toSqlText(input.partnerships_email) ?? undefined,
        ],
        ["catering_email", toSqlText(input.catering_email) ?? undefined],
        ["careers_email", toSqlText(input.careers_email) ?? undefined],
      ];
      const updated: Record<string, string> = {};
      const normalizedEntries: Array<[SocialKey, string]> = [];
      for (const [key, value] of map) {
        if (value === undefined) continue;
        const trimmed = value.trim();
        normalizedEntries.push([key, trimmed]);
      }
      for (const [key, value] of normalizedEntries) {
        await setConfig(db, orgId, siteId, key, value);
        updated[key] = value;
      }
      if (Object.keys(updated).length === 0)
        return { error: "No fields provided." };
      return { updated };
    }

    case "list_site_locales":
    case "get_resource_localization":
    case "put_resource_localization":
    case "delete_resource_localization":
    case "get_product_catalog_localization":
    case "sync_product_catalog_localization": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // ── Experiences ────────────────────────────────────────────────────────
    case "list_experiences": {
      return runMcpExecutorToolForChowbot(executorSite, "list_experiences", input);
    }

    case "create_experience": {
      // ChowBot-only convenience: MCP's create_experience only falls back
      // from explicit location_id to the site's primary_location_id. ChowBot
      // additionally tries the dashboard's current-page location first, and
      // (if the site has no primary set) the first location by is_primary/id
      // order, before giving up — preserved here rather than narrowed to
      // MCP's simpler fallback.
      if (!toSqlText(input.location_id)) {
        const verifiedCtxLocationId = ctx.locationId
          ? (await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?`, [ctx.locationId, orgId, siteId]))?.id
          : null;
        const fallbackLocationId = verifiedCtxLocationId
          ?? (await queryFirst<{ primary_location_id: string | null }>(db, `SELECT primary_location_id FROM sites WHERE id = ? AND organization_id = ?`, [siteId, orgId]))?.primary_location_id
          ?? (await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE site_id = ? AND organization_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`, [siteId, orgId]))?.id
          ?? null;
        if (fallbackLocationId) input.location_id = fallbackLocationId;
      }
      return runMcpExecutorToolForChowbot(executorSite, "create_experience", input);
    }

    case "update_experience": {
      // ChowBot-only convenience: when slot_weekday convenience args are
      // used, MCP's expandSlotGeneratorArgs (mcp-executor/shared.ts) only
      // merges against whatever recurring_slots was ALSO passed in the same
      // call — if the caller reasonably sends just the one weekday's
      // convenience params, every other weekday's schedule is silently
      // dropped. Pre-merge against the experience's actual current state
      // here instead, so the adapter call carries a fully-formed
      // recurring_slots object and MCP's simpler merge is never exercised
      // for this case.
      const experienceId = toSqlText(input.experience_id);
      const slotWeekday = typeof input.slot_weekday === "string" && WEEKDAY_NAMES.includes(input.slot_weekday as (typeof WEEKDAY_NAMES)[number])
        ? input.slot_weekday
        : null;
      if (
        experienceId &&
        slotWeekday &&
        typeof input.slot_start === "string" &&
        typeof input.slot_end === "string" &&
        typeof input.slot_interval_minutes === "number"
      ) {
        const { generateSlots } = await import("~/server/utils/experiences");
        const generated = generateSlots(input.slot_start, input.slot_end, input.slot_interval_minutes);
        const existingExperience = await getExperienceById(db, siteId, experienceId);
        const existingRecurring = existingExperience?.recurring_slots && typeof existingExperience.recurring_slots === "object"
          ? existingExperience.recurring_slots as Record<string, unknown>
          : {};
        const incomingRecurring = input.recurring_slots && typeof input.recurring_slots === "object"
          ? input.recurring_slots as Record<string, unknown>
          : {};
        input = {
          ...input,
          recurring_slots: { ...existingRecurring, ...incomingRecurring, [slotWeekday]: generated },
          slot_start: undefined,
          slot_end: undefined,
          slot_interval_minutes: undefined,
          slot_weekday: undefined,
        };
      }
      return runMcpExecutorToolForChowbot(executorSite, "update_experience", input);
    }

    case "delete_experience": {
      return runMcpExecutorToolForChowbot(executorSite, "delete_experience", input);
    }

    case "list_experience_bookings": {
      // ChowBot-only convenience: fall back to the dashboard's current page
      // location when the model omits location_id.
      return runMcpExecutorToolForChowbot(executorSite, "list_experience_bookings", {
        ...input,
        location_id: input.location_id ?? ctx.locationId,
      });
    }

    case "update_experience_booking": {
      return runMcpExecutorToolForChowbot(executorSite, "update_experience_booking", input);
    }

    case "get_experience_availability": {
      const { getExperienceById, getSlotAvailability, resolveExperienceTimezone } = await import("~/server/utils/experiences");
      const experienceId = toSqlText(input.experience_id);
      const date = toSqlText(input.date);
      const requestedDays = Number(input.days);
      const days = Number.isFinite(requestedDays)
        ? Math.max(1, Math.min(Math.floor(requestedDays), 14))
        : 1;
      if (!experienceId || !date)
        return { error: "experience_id and date are required" };
      const experience = await getExperienceById(db, siteId, experienceId);
      if (!experience) return { error: "Experience not found" };
      const timezone = await resolveExperienceTimezone(db, orgId, siteId, experience);

      const dates: Array<{ date: string; slots: Awaited<ReturnType<typeof getSlotAvailability>> }> = [];
      const cursor = new Date(`${date}T00:00:00Z`);
      if (isNaN(cursor.getTime())) {
        return { error: "Invalid calendar date" };
      }
      for (let i = 0; i < days; i++) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const slots = await getSlotAvailability(db, siteId, experience, dateStr, timezone);
        dates.push({ date: dateStr, slots });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return { dates };
    }

    case "set_experience_slot_override": {
      const { upsertSlotOverride } = await import("~/server/utils/experiences");
      const experienceId = toSqlText(input.experience_id);
      const date = toSqlText(input.date);
      const timeSlot = toSqlText(input.time_slot);
      const status = toSqlText(input.status);
      if (!experienceId || !date || !timeSlot || !status)
        return { error: "experience_id, date, time_slot, and status are required" };
      if (!["closed", "open"].includes(status))
        return { error: "status must be closed or open" };
      const capacityOverride = input.capacity_override !== undefined && input.capacity_override !== null
        ? Number(input.capacity_override)
        : undefined;
      const note = toSqlText(input.note);
      const result = await upsertSlotOverride(db, orgId, siteId, experienceId, {
        override_date: date,
        time_slot: timeSlot,
        status: status as "closed" | "open",
        capacity_override: capacityOverride,
        note: note,
      }, userId);
      return { success: true, override: result };
    }

    case "list_experience_slot_overrides": {
      const { listSlotOverrides } = await import("~/server/utils/experiences");
      const experienceId = toSqlText(input.experience_id);
      if (!experienceId)
        return { error: "experience_id is required" };
      const from = toSqlText(input.from);
      const to = toSqlText(input.to);
      const overrides = await listSlotOverrides(db, siteId, experienceId, { fromDate: from ?? undefined, toDate: to ?? undefined });
      return { overrides };
    }

    // Both require the managed_service entitlement on MCP (tool.requiredEntitlement),
    // which the adapter now enforces — the old case bodies here had no
    // entitlement check at all.
    case "create_work_request":
    case "list_work_requests": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "search_public_resources": {
      const query = toSqlText(input.q)?.trim();
      const type = toSqlText(input.type);
      if (!query) return { error: "q is required." };
      if (type && !PUBLIC_SEARCH_TYPES.includes(type as PublicSearchTypeFilter)) {
        return { error: `type must be one of: ${PUBLIC_SEARCH_TYPES.join(", ")}` };
      }
      const results = await searchPublicResources(env, query, {
        type: (type as PublicSearchTypeFilter) ?? "all",
        limit: 8,
        surface: "chowbot",
      });
      return { results };
    }

    case "get_post": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // Regression fix: seo_description/seo_keywords/canonical_url/robots were
    // in ChowBot's old create/update schema but the case bodies never
    // forwarded them to createPlatformBlogPost/updatePlatformBlogPost —
    // silently dropped despite the underlying function fully supporting them.
    case "list_blog_posts":
    case "get_blog_post":
    case "create_blog_post":
    case "update_blog_post":
    case "delete_blog_post": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_location": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_site_settings": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "update_media_asset": {
      return runMcpExecutorToolForChowbot(executorSite, "update_media_asset", input);
    }

    case "set_media":
    case "attach_media":
    case "remove_media":
    case "reorder_media": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_notification_settings":
    case "update_notification_settings": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "update_location_qa":
    case "reorder_location_qa": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "update_site_qa":
    case "reorder_site_qa": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_experience": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // Domain management (create_domain, sync_domain, etc.) also lives in
    // mcp-executor/settings.ts but is intentionally not exposed to ChowBot —
    // ACME token rotation is a platform-admin concern.
    // Only get_dashboard_link overlaps between the two surfaces.
    case "get_dashboard_link": {
      return runMcpExecutorToolForChowbot(executorSite, "get_dashboard_link", input);
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function executeChowBotToolForTest(
  name: string,
  input: ApiRecord,
  ctx: {
    db: D1Database;
    env: ApiRecord;
    orgId: string;
    siteId: string;
    userId: string;
    memberId: string;
    userRole?: string;
    agentMessages?: AiMessage[];
    locationId?: string | null;
    channel?: "dashboard" | "whatsapp";
    pendingMedia?: { assetId: string; siteId: string };
  },
): Promise<ApiValue> {
  return executeTool(name, input, ctx);
}

export async function runChowBot(
  opts: RunChowBotOptions,
): Promise<RunChowBotResult> {
  const { db, env, orgId, siteId, userId } = opts;

  const creditOk = await hasCredits(db, orgId, opts.sessionId);
  if (!creditOk) throw new Error("No AI credits remaining.");

  if (!Array.isArray(opts.messages) || !opts.messages.length) {
    throw new Error("messages array required");
  }

  const siteName = opts.siteName;
  const currentPage = opts.currentPage ?? "dashboard";
  const locationId =
    typeof opts.locationId === "string" && opts.locationId
      ? opts.locationId
      : null;
  const channel = opts.channel ?? "dashboard";

  // Resolve current location name for richer context
  let locationName: string | null = null;
  if (locationId) {
    const loc = await queryFirst<{ title: string }>(
      db,
      `SELECT title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
      [locationId, siteId],
    );
    locationName = loc?.title ?? null;
  }

  const isSetup = currentPage === "setup";

  const SETUP_PREAMBLE = isSetup
    ? `
You are in SETUP MODE. Your job is to guide the restaurant owner through a structured setup interview to get their site live.

Setup order (ask one topic at a time, save each answer immediately using tools before moving on):
1. Greet the owner warmly. Confirm the restaurant name — if they want to change it call rename_site.
2. Ask for the primary location — accept a Google Maps URL (use import_from_maps), or typed address. Use create_location to save immediately.
3. Ask for opening hours if not captured from Google Maps. Use update_location to save.
4. Ask for the first Products: "What dishes or Products do you offer? List a few with categories and prices." Use batch_create_products with the location_id.
5. Ask for a one-line brand description (for SEO and the homepage hero). Use save_brand_description to save immediately.
6. Summarise what was set up and tell them they can publish from the Overview page when ready.

Rules in setup mode:
- Ask ONE question at a time. Wait for the answer before moving to the next topic.
- Save answers IMMEDIATELY with tools before asking the next question. Never batch questions.
- Be warm, concise, and encouraging. First impressions matter.
- If the owner pastes a Google Maps link, call import_from_maps immediately then create_location.
- If they paste a Product list, call batch_create_products immediately with the explicit location_id.
- Never ask for information already visible from the site context above.
- If the owner skips a step, acknowledge it and move forward.
`
    : "";

  const managedServiceGuidance = isConversationalToolGroupEnabled(env, "managed_service")
    ? "- Priority-support requests: submit work to the KrabiClaw support queue (content, SEO, Google Places, seasonal, photos, social media)\n"
    : "";
  const localeGuidance = "- Localized content: use list_site_locales and the exact resource-localization tools. These tools never initiate billing, use AI credits, or return English fallback content.\n";

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using Krabiclaw.
Help manage all site content with concise, action-oriented responses.
${SETUP_PREAMBLE}
Site: ${siteName}
Default Product currency: ${opts.defaultCurrency}
Current page: ${currentPage}${locationId ? `\nCurrent location: ${locationName ?? locationId} (id: ${locationId})` : ""}
${opts.pendingMedia ? `Pending WhatsApp media: asset_id ${opts.pendingMedia.assetId}. Build placement {owner_type, owner_id, slot} from the exact target entity. Use set_media with asset_id for a single cover/hero/logo, or attach_media with asset_id for a gallery/document list. For a Product primary use {owner_type:"product", owner_id:<product.id>, slot:"image"}; for its detail gallery use slot:"gallery". If the user wants to extract Products from it, call import_products_from_media with the explicit location_id and this asset_id. If it is a Markdown document (.md/.markdown) and the user wants a summary or grounded answer, call analyze_document. If the user wants to just save it to the library without assigning it, call resolve_pending_media with action=save_media. To discard, call resolve_pending_media with action=cancel. If the user's intent is unclear, ask one short clarifying question.` : ""}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create, update, delete, publish (standard/offer/event/update with CTA) — optionally location-scoped
- Products: list by explicit location, create, update, reconcile, reorder, rename/delete categories, import from media, and delete
- Locations: list, create, update, delete (title syncs slug, plus manual address, hours, maps URL, Place ID, rating, review count, description, email, website, socials, price level, hero media), lookup from Google Maps URL
- Reviews: list location reviews and reply as owner
- Media: list per location, delete, generate AI images with the configured OpenAI image model (auto-saved, returns asset_id)
- Q&A: list, add, delete per location
- Experiences: list, create (title, tagline, rich body, price, duration, capacity, time slots, image, SEO), update, delete, view/confirm/cancel guest bookings
- Contact & reservation submissions: read
- Public help: search platform docs, blog posts, FAQs, and route guidance for direct links
${managedServiceGuidance}${localeGuidance}- Site: rename (updates subdomain), set default Product currency, read/write site page content (including reservation policies via reservations page)
- Stats: posts, Products, locations, reviews

Guidelines:
- Use tools immediately — never say "I'll do that" without calling a tool
- Follow every paginated read until its page_info.has_more field is false; pass page_info.next_cursor back to the same tool.
- For existing Product edits, replacements, revised prices/descriptions, renamed Products, or mixed create/update work, inspect every list_location_products page and then use sync_products or update_product.
- Product batch tools are atomic. Send one complete intended create or reconciliation call; never split one logical replacement across multiple mutations.
- For Product category changes use rename_product_category; to remove a category and all its Products use delete_product_category.
- Product and Experience monetary values use the nested Price contract. amount_minor is an integer in the Price currency; unit is item, person, or table; tax_behavior is unspecified, inclusive, or exclusive. The site default currency applies only when creating a Price without an explicit currency.
- Inquiry-only Experiences have price: null and may use pricing_note for concise text such as "Ask us about monthly pricing". Never combine an active Price with pricing_note.
- Repricing creates an immutable replacement Price. Use compare_at_amount_minor only when it exceeds amount_minor, and valid_from/valid_until ISO instants for a non-overlapping scheduled interval. Only schedule or change pricing when the user explicitly asks.
- Every Product collection mutation requires an explicit location_id. Never infer or omit it.
- Reservation rules, hold times, cancellation windows, deposits, and experience cancellation terms are structured booking policy fields specifically — not editable through any tool available here. Tell the user to edit those specific fields in the dashboard instead of attempting it. The reservations page's own copy (title, intro text, images) is regular page content and stays editable like any other page — see the next line
- Use search_public_resources for docs/help/product questions, support routing, and when the user asks where something lives in public docs or on the platform site
- Use list_tenant_pages to resolve a page variant, get_tenant_page to inspect its complete canonical block state, and update_tenant_page with that complete block array.
- Before publish_post, delete_post, delete_product, delete_product_category, delete_location, delete_media_asset, or delete_location_qa — confirm first
- Keep responses short — this is a chat panel`;

  const MAX_MSG_CHARS = 20000;
  let initialMessages = opts.messages.slice(-8);
  while (initialMessages.length > 0 && initialMessages[0]?.role !== "user") {
    initialMessages = initialMessages.slice(1);
  }
  if (!initialMessages.length) {
    throw new Error("Conversation must contain at least one user message");
  }
  const agentMessages: AiMessage[] = initialMessages.map((m) => {
    const raw =
      typeof m.content === "string" ? m.content : String(m.content ?? "");
    return {
      role: m.role as "user" | "assistant",
      content:
        raw.length > MAX_MSG_CHARS
          ? raw.slice(0, MAX_MSG_CHARS) + "\n…[truncated]"
          : raw,
    };
  });

  const emit = async (event: ChowBotRunEvent) => {
    if (opts.onEvent) await opts.onEvent(event);
  };

  const ctx = {
    db,
    env,
    orgId,
    siteId,
    userId,
    memberId: opts.memberId,
    userRole: opts.userRole,
    agentMessages,
    locationId,
    channel,
    pendingMedia: opts.pendingMedia,
    sessionId: opts.sessionId,
  };
  const toolCalls: ChowBotToolCall[] = [];
  const tools = filterConversationalTools(CHOWBOT_TOOLS, env)
    .map((tool) => normalizeChowBotToolForConversationalSurface(tool, env));
  let totalInput = 0,
    totalOutput = 0,
    cfLogId: string | null = null;
  let responseText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let aiResponse;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        aiResponse = await callAiGateway(env, agentMessages, {
          system: SYSTEM,
          tools,
          maxTokens: 8192,
          metadata: { org_id: orgId, site_id: siteId, action: "chowbot" },
        });
        break;
      } catch (err) {
        const errorMessage = getErrorMessage(err, "");
        const is429 =
          errorMessage.includes("429") || errorMessage.includes("rate_limit");
        if (is429 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 8000));
          continue;
        }
        const message = is429
          ? "Rate limit hit — please wait a moment."
          : getErrorMessage(err, "AI generation failed.");
        await emit({ type: "error", message });
        throw new Error(message);
      }
    }
    if (!aiResponse) {
      const message = "AI generation failed after retry.";
      await emit({ type: "error", message });
      throw new Error(message);
    }

    totalInput += aiResponse.usage.input_tokens;
    totalOutput += aiResponse.usage.output_tokens;
    cfLogId = aiResponse.cfLogId;

    if (aiResponse.stop_reason === "end_turn") {
      responseText =
        aiResponse.content.find((b) => b.type === "text")?.text ?? "";
      await emit({ type: "text", content: responseText });
      break;
    }

    if (aiResponse.stop_reason === "tool_use") {
      agentMessages.push({ role: "assistant", content: aiResponse.content });
      const results: Array<{
        type: "tool_result";
        tool_use_id?: string;
        content: string;
      }> = [];
      for (const block of aiResponse.content) {
        if (block.type !== "tool_use") continue;
        await emit({ type: "tool_start", name: block.name });
        const result = await executeTool(
          block.name || "",
          block.input ?? {},
          ctx,
        );
        toolCalls.push({ name: block.name || "", input: block.input, result });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
        await emit({ type: "tool_done", name: block.name });
      }
      agentMessages.push({ role: "user", content: results });
      continue;
    }

    responseText =
      aiResponse.stop_reason === "max_tokens"
        ? "Response too large. Try adding items section by section."
        : (aiResponse.content.find((b) => b.type === "text")?.text ?? "");
    await emit({ type: "text", content: responseText });
    break;
  }

  // If we exhausted iterations without getting a final response
  if (!responseText) {
    responseText =
      "I ran into complexity limits. Please try a simpler request or break it into steps.";
    await emit({ type: "text", content: responseText });
  }

  const charged = await chargeCredits(db, orgId, {
    siteId,
    sessionId: opts.sessionId,
    action: "chowbot",
    model: CHOWBOT_MODEL,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cfGatewayLogId: cfLogId,
  });

  const result = {
    responseText,
    toolCalls,
    creditsRemaining: charged.newBalance,
  };
  await emit({ type: "done", toolCalls, creditsRemaining: charged.newBalance });
  return result;
}

export function createChowBotStream(
  run: (_onEvent: (_event: ChowBotRunEvent) => Promise<void>) => Promise<void>,
) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const push = async (data: ChowBotRunEvent) => {
    try {
      await writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // Client disconnected while streaming.
    }
  };

  (async () => {
    try {
      await run(push);
    } catch (err) {
      await push({
        type: "error",
        message: getErrorMessage(err, "Something went wrong."),
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // Stream may already be closed after client disconnect.
      }
    }
  })();

  return readable;
}

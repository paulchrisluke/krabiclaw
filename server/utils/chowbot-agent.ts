import {
  callAiGateway,
  type AiMessage,
} from "~/server/utils/ai-gateway";
import { hasCredits, chargeCredits } from "~/server/utils/ai-credits";
import { runMcpExecutorToolForChowbot } from "~/server/utils/mcp-executor/chowbot-adapter";
import { normalizeRole } from "~/server/utils/mcp-auth";
import { setConfig } from "~/server/utils/site-config";
import { upsertSiteLocale } from "~/server/utils/site-locales";
import { getPlaceDetails, searchPlaces } from "~/server/utils/google-places";
import { upsertChannelState } from "~/server/utils/chowbot-conversations";
import { CHOWBOT_MODEL } from "~/server/utils/ai-models";
import { updateSiteSettingsFields } from "~/server/utils/site-settings";
import {
  getExperienceById,
  WEEKDAY_NAMES,
} from "~/server/utils/experiences";
import { contentRegistry } from "~/config/content-registry";
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
  userRole?: string;
  siteName: string;
  defaultCurrency: string;
  messages: ChowBotIncomingMessage[];
  currentPage?: string;
  locationId?: string | null;
  channel?: "dashboard" | "whatsapp";
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

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getToolString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function isSiteContentPage(page: string): page is keyof typeof contentRegistry {
  return Object.prototype.hasOwnProperty.call(contentRegistry, page);
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
    userRole?: string;
    agentMessages?: AiMessage[];
    locationId?: string | null;
    channel?: "dashboard" | "whatsapp";
    pendingMedia?: { assetId: string; siteId: string };
    forceSubdomainRegistrationFailure?: boolean;
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
  const executorSite = {
    db,
    env: env as CloudflareEnv,
    userId,
    organizationId: orgId,
    siteId,
    role: normalizedRole,
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

    // Menu tools below all delegate to the same mcp-executor/menus.ts handlers
    // MCP uses, via runMcpExecutorToolForChowbot — see mcp-executor/chowbot-adapter.ts.
    case "get_menu":
    case "add_menu_items_batch":
    case "sync_menu_items":
    case "create_menu_item":
    case "update_menu_item":
    case "reorder_menu_items":
    case "set_menu_item_image": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "create_menu": {
      // ChowBot-only convenience: fall back to the dashboard's current page
      // location when the model omits location_id (MCP always requires it explicit).
      return runMcpExecutorToolForChowbot(executorSite, "create_menu", {
        ...input,
        location_id: input.location_id ?? ctx.locationId ?? undefined,
      });
    }

    case "update_menu":
    case "rename_menu_section":
    case "delete_menu_section":
    case "delete_menu_item":
    case "delete_menu": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "publish_menu": {
      // ChowBot-only ergonomic name — delegates to update_menu's status field.
      return runMcpExecutorToolForChowbot(executorSite, "update_menu", {
        menu_id: input.menu_id,
        status: "published",
      });
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
          const details = await getPlaceDetails(apiKey, placeId, false);
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

    case "import_menu_from_media": {
      // ChowBot's variant resolves asset_id from WhatsApp's pending-media
      // state rather than taking it as a direct argument (MCP's ChatGPT
      // callers already have a resolved assetId from upload_user_media).
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: "No pending WhatsApp media is available to import." };
      }
      const result = await runMcpExecutorToolForChowbot(executorSite, "import_menu_from_media", {
        asset_id: ctx.pendingMedia.assetId,
        menu_name: toSqlText(input.menu_name)?.trim() || undefined,
      }) as { error?: string; menuId?: string; count?: number; warning?: unknown; creditsRemaining?: unknown };
      if (result.error) return result;
      if (ctx.channel === "whatsapp") {
        await upsertChannelState(db, {
          userId,
          channel: "whatsapp",
          selectedSiteId: siteId,
          pendingMedia: null,
          pendingConfirmation: null,
        });
      }
      return {
        asset_id: ctx.pendingMedia.assetId,
        menu_id: result.menuId,
        imported_items: result.count,
        warning: result.warning,
        credits_remaining: result.creditsRemaining,
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
          pendingMedia: null,
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
        location_id: input.location_id ?? null,
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
        action: "generate_image",
        model: IMAGE_MODEL,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        cfGatewayLogId: generated.cfLogId,
      });
      return { asset_id: assetId, publicUrl, thumbnailUrl };
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
        location_id: input.location_id ?? ctx.locationId ?? undefined,
      });
    }

    // Regression fix: update_page_content/delete_content_field used to
    // maintain their own inline hero-field read-merge-write logic
    // (readHeroContentState/heroColumnForField/isEmptyHeroState), duplicating
    // what mcp-workflows.ts's updatePageContent/deleteContentField already
    // do correctly via a CASE-based partial upsert — that shared function
    // accepts the exact same "hero.title"/"hero.subtitle"/"hero.image"/
    // "hero.video" field keys via HERO_FIELD_ALIASES. deleteContentField's
    // hero handling didn't exist at all before this branch (see the fix in
    // mcp-workflows.ts) — MCP's delete_content_field silently deleted
    // nothing for hero sub-fields, since they live as columns on a single
    // row keyed by field="hero", not their own row.

    // Both delegate to mcp-executor/content.ts's get/update_professional_service_content
    // cases, which call the same getProfessionalServiceContent/upsertProfessionalServiceContent
    // functions the dashboard editor and MCP both use — see professional-services-editor.ts.
    case "get_professional_service_content":
      return runMcpExecutorToolForChowbot(executorSite, "get_professional_service_content", input);

    case "update_professional_service_content":
      return runMcpExecutorToolForChowbot(executorSite, "update_professional_service_content", input);

    case "get_page_fields": {
      const page = getToolString(input, "page", 40);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };
      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);
      return runMcpExecutorToolForChowbot(executorSite, "get_page_fields", {
        page,
        location_id: targetLocationId,
      });
    }

    case "update_page_content": {
      const page = getToolString(input, "page", 40);
      const field = getToolString(input, "field", 80);
      const value = getToolString(input, "value", 20000);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };
      if (!field) return { error: "Field is required." };
      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);
      return runMcpExecutorToolForChowbot(executorSite, "update_page_content", {
        page,
        changes: { [field]: value ?? "" },
        location_id: targetLocationId,
      });
    }

    case "delete_content_field": {
      const page = getToolString(input, "page", 40);
      const field = getToolString(input, "field", 80);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };
      if (!field) return { error: "Field is required." };
      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);
      return runMcpExecutorToolForChowbot(executorSite, "delete_content_field", {
        page,
        field,
        location_id: targetLocationId,
      });
    }

    case "get_site_stats": {
      const [postStats, menuCount, itemCount, locationCount, reviewCount] =
        await Promise.all([
          queryAll(
            db,
            `SELECT status, COUNT(*) as count FROM posts WHERE organization_id = ? AND site_id = ? GROUP BY status`,
            [orgId, siteId],
          ),
          queryFirst<{ count: number }>(
            db,
            `SELECT COUNT(*) as count FROM menus WHERE organization_id = ? AND site_id = ?`,
            [orgId, siteId],
          ),
          queryFirst<{ count: number }>(
            db,
            `SELECT COUNT(*) as count FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.organization_id = ? AND m.site_id = ?`,
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
          draft: byStatus.draft ?? 0,
          published: byStatus.published ?? 0,
          archived: byStatus.archived ?? 0,
        },
        menus: menuCount?.count ?? 0,
        menu_items: itemCount?.count ?? 0,
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
        {
          forceSubdomainRegistrationFailure:
            ctx.forceSubdomainRegistrationFailure,
        },
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
        | "social_facebook"
        | "social_instagram"
        | "social_tiktok"
        | "footer_tagline"
        | "press_email"
        | "partnerships_email"
        | "catering_email"
        | "careers_email";
      const urlKeys = new Set<SocialKey>([
        "social_facebook",
        "social_instagram",
        "social_tiktok",
      ]);
      const map: Array<[SocialKey, string | undefined]> = [
        ["social_facebook", toSqlText(input.facebook_url) ?? undefined],
        ["social_instagram", toSqlText(input.instagram_url) ?? undefined],
        ["social_tiktok", toSqlText(input.tiktok_url) ?? undefined],
        ["footer_tagline", toSqlText(input.footer_tagline) ?? undefined],
        ["press_email", toSqlText(input.press_email) ?? undefined],
        [
          "partnerships_email",
          toSqlText(input.partnerships_email) ?? undefined,
        ],
        ["catering_email", toSqlText(input.catering_email) ?? undefined],
        ["careers_email", toSqlText(input.careers_email) ?? undefined],
      ];
      const updated: Record<string, string> = {};
      const invalidFields: string[] = [];
      const normalizedEntries: Array<[SocialKey, string]> = [];
      for (const [key, value] of map) {
        if (value === undefined) continue;
        const trimmed = value.trim();
        if (urlKeys.has(key) && trimmed && !isValidHttpUrl(trimmed)) {
          invalidFields.push(key);
          continue;
        }
        normalizedEntries.push([key, trimmed]);
      }
      if (invalidFields.length)
        return {
          error: `Invalid URL scheme for: ${invalidFields.join(", ")}. Only http/https are allowed.`,
        };
      for (const [key, value] of normalizedEntries) {
        await setConfig(db, orgId, siteId, key, value);
        updated[key] = value;
      }
      if (Object.keys(updated).length === 0)
        return { error: "No fields provided." };
      return { updated };
    }

    // Same previously-unreachable-despite-the-feature-flag bug as the
    // translations tools below, one mcp-executor domain over (locales).
    case "list_locales":
    case "upsert_locale":
    case "delete_locale": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // All six require the 'translation' entitlement on MCP (tool.
    // requiredEntitlement), enforced generically by the adapter. These were
    // previously unreachable from ChowBot even with
    // CONVERSATIONAL_TOOLS_TRANSLATIONS_ENABLED=true — the case bodies
    // existed but chowbot-tools/translations.ts never exposed their
    // schemas, so filterConversationalTools had nothing to un-hide.
    case "get_translation_inventory":
    case "list_translation_jobs":
    case "get_translation_job":
    case "run_translation_job_batch": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "start_translation_job": {
      return runMcpExecutorToolForChowbot(executorSite, "start_translation_job", input);
    }

    case "publish_translations": {
      const result = await runMcpExecutorToolForChowbot(executorSite, "publish_translations", input) as {
        error?: string;
        target_locale?: string;
      };
      if (result.error) return result;
      // ChowBot-only extra step: MCP's publish_translations only marks
      // drafts as published, it doesn't enable the site locale itself —
      // ChowBot has historically done both in one call.
      if (result.target_locale) {
        await upsertSiteLocale(db, orgId, siteId, {
          locale: result.target_locale,
          status: "published",
          fallback_enabled: true,
        });
      }
      return result;
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
        location_id: input.location_id ?? ctx.locationId ?? undefined,
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
      const note = toSqlText(input.note) ?? undefined;
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
      const from = toSqlText(input.from) ?? undefined;
      const to = toSqlText(input.to) ?? undefined;
      const overrides = await listSlotOverrides(db, siteId, experienceId, { fromDate: from, toDate: to });
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

    case "get_post":
    case "set_post_image": {
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
    case "set_blog_post_image":
    case "delete_blog_post": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "list_menus": {
      return runMcpExecutorToolForChowbot(executorSite, "list_menus", input);
    }

    case "get_location":
    case "set_location_hero_image":
    case "set_location_hero_video": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_site_settings":
    case "set_logo": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // Regression fix: this previously accepted title/caption fields that
    // updateMediaAssetMetadata's signature never supported (only alt_text,
    // location_id, category exist) — those were silently dropped, so
    // "update the caption" always claimed success while doing nothing.
    case "update_media_asset": {
      return runMcpExecutorToolForChowbot(executorSite, "update_media_asset", input);
    }

    // Regression fix: set_about_story_image/set_home_story_image stored a
    // pre-resolved CDN public_url string directly in site_content.value.
    // Every other media-typed content field (content-registry's
    // 'story.image' is type: 'media') stores the raw asset_id and lets
    // resolveMediaFieldUrls resolve it to a URL at read time — storing a
    // frozen URL instead loses the asset_id linkage (can't tell which
    // media_asset this came from) and won't reflect a future CDN URL
    // rotation for that asset. MCP's set_about_story_image/
    // set_home_story_image already used the correct asset_id-storing path.
    case "set_home_hero_image":
    case "set_home_hero_video":
    case "update_home_hero":
    case "set_about_story_image":
    case "set_home_story_image": {
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

    case "get_experience":
    case "set_experience_image":
    case "set_experience_video": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    case "get_translation_review_items":
    case "save_translation_review_item": {
      return runMcpExecutorToolForChowbot(executorSite, name, input);
    }

    // Domain management (create_domain, sync_domain, etc.) also lives in
    // mcp-executor/settings.ts but is intentionally not exposed to ChowBot —
    // see CLAUDE.md's Custom Domains section on ACME token rotation risk.
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
    userRole?: string;
    agentMessages?: AiMessage[];
    locationId?: string | null;
    channel?: "dashboard" | "whatsapp";
    pendingMedia?: { assetId: string; siteId: string };
    forceSubdomainRegistrationFailure?: boolean;
  },
): Promise<ApiValue> {
  return executeTool(name, input, ctx);
}

export async function runChowBot(
  opts: RunChowBotOptions,
): Promise<RunChowBotResult> {
  const { db, env, orgId, siteId, userId } = opts;

  const creditOk = await hasCredits(db, orgId);
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
4. Ask for the first menu: "What dishes do you serve? List a few items with prices or paste your menu." Use create_menu then add_menu_items_batch then publish_menu.
5. Ask for a one-line brand description (for SEO and the homepage hero). Use save_brand_description to save immediately.
6. Summarise what was set up and tell them they can publish from the Overview page when ready.

Rules in setup mode:
- Ask ONE question at a time. Wait for the answer before moving to the next topic.
- Save answers IMMEDIATELY with tools before asking the next question. Never batch questions.
- Be warm, concise, and encouraging. First impressions matter.
- If the owner pastes a Google Maps link, call import_from_maps immediately then create_location.
- If they paste a menu list, call create_menu then add_menu_items_batch then publish_menu immediately.
- Never ask for information already visible from the site context above.
- If the owner skips a step, acknowledge it and move forward.
`
    : "";

  const managedServiceGuidance = isConversationalToolGroupEnabled(env, "managed_service")
    ? "- Managed service requests: submit work to Paul & Julia's queue (content, translation, SEO, Google Business, seasonal, photos, social media)\n"
    : "";
  const translationCapabilityGuidance = isConversationalToolGroupEnabled(env, "translations")
    ? "- Languages and translations: manage locales, estimate site translation cost, queue translation jobs, inspect translation jobs, run translation batches, publish reviewed drafts\n"
    : "";
  const translationWorkflowGuidance = isConversationalToolGroupEnabled(env, "translations")
    ? "- Use list_locales, upsert_locale, and delete_locale when the user asks to add, publish, disable, delete, or change the source language for translated site versions\n- Use get_translation_inventory before start_translation_job; tell the owner item count and estimated credits, then get confirmation before queuing the job\n- Use run_translation_job_batch only after a job exists and the owner confirms spending credits; it processes one batch and saves translations as drafts\n- Use publish_translations after the owner confirms drafted translations should go live; published languages become visible on the public site\n"
    : "- If the owner asks for translations or language management, direct them to the dashboard; conversational translation tools are not enabled here.\n";
  const translationConfirmationGuidance = isConversationalToolGroupEnabled(env, "translations")
    ? "- Before delete_locale, start_translation_job, run_translation_job_batch, or publish_translations — confirm first\n"
    : "";

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using Krabiclaw.
Help manage all site content with concise, action-oriented responses.
${SETUP_PREAMBLE}
Site: ${siteName}
Default menu currency: ${opts.defaultCurrency}
Current page: ${currentPage}${locationId ? `\nCurrent location: ${locationName ?? locationId} (id: ${locationId})` : ""}
${opts.pendingMedia ? `Pending WhatsApp media: asset_id ${opts.pendingMedia.assetId}. Use this asset_id directly in any tool that accepts image/media — update_menu_item (image_asset_id), create_menu_item (image_asset_id), add_menu_items_batch (image_asset_id), update_location or create_location (hero_image_asset_id / hero_video_asset_id), create_post (image_asset_id for the cover, or gallery_media for additional public post media). If the user wants to import/extract menu items from it, call import_menu_from_media. If the user wants to just save it to the library without assigning it, call resolve_pending_media with action=save_media. To discard, call resolve_pending_media with action=cancel. After using it in a tool call, also call resolve_pending_media with action=save_media to clear the pending state. If the user's intent is unclear, ask one short clarifying question.` : ""}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create, update, delete, publish (standard/offer/event/update with CTA) — optionally location-scoped
- Menus: create, rename, view, rename/delete sections/categories, add brand-new items, reconcile/update item lists, update/delete individual items, publish, delete
- Locations: list, create, update, delete (title syncs slug, plus manual address, hours, maps URL, Place ID, rating, review count, description, email, website, socials, price level, hero media), lookup from Google Maps URL
- Reviews: list location reviews and reply as owner
- Media: list per location, delete, generate AI images with the configured OpenAI image model (auto-saved, returns asset_id)
- Q&A: list, add, delete per location
- Experiences: list, create (title, tagline, rich body, price, duration, capacity, time slots, image, SEO), update, delete, view/confirm/cancel guest bookings
- Contact & reservation submissions: read
- Public help: search platform docs, blog posts, FAQs, and route guidance for direct links
${managedServiceGuidance}- Site: rename (updates subdomain), set default menu currency, read/write site page content (including reservation policies via reservations page)
${translationCapabilityGuidance}- Stats: posts, menus, locations, reviews

Guidelines:
- Use tools immediately — never say "I'll do that" without calling a tool
- For existing menu edits, replacements, revised prices/descriptions, renamed dishes, or mixed create/update work, inspect the menu with get_menu and then use sync_menu_items or update_menu_item
- For menu category changes like renaming Appetizers to Starters or Drinks to Beverages, use rename_menu_section
- For deleting one dish use delete_menu_item; for deleting a whole category and all dishes inside it use delete_menu_section
- Store menu prices as price_amount only. Use the site default currency for display unless the user asks to change the currency, then call set_default_currency.
- Store experience prices as price_amount (numeric). Use price (string) only for non-numeric display like "Ask us". If a user sets an experience price, always set price_amount; never store it only as a price string.
- compare_at_price_amount/sale_starts_at/sale_ends_at are the canonical sale fields for both menu items and experiences: keep price_amount as the current selling price, set compare_at_price_amount to the regular/pre-sale price, and optionally set sale_starts_at/sale_ends_at (ISO 8601) to schedule when it auto-expires. Only set these when the user explicitly asks to run, change, or end a sale — never fabricate a discount they didn't ask for.
- Use add_menu_items_batch only when the user is clearly adding brand-new items that are not already on the menu
- Never use add_menu_items_batch to replace, revise, rename, or update existing menu items
- When creating menus, omit location_id — the server links it to the current location automatically
- Use get_booking_policy, preview_booking_policy, and update_booking_policy when the user asks about reservation rules, hold times, cancellation windows, deposits, or experience cancellation terms
- Use search_public_resources for docs/help/product questions, support routing, and when the user asks where something lives in public docs or on the platform site
${translationWorkflowGuidance}- Use get_page_fields, update_page_content, and delete_content_field for tenant page content such as home, about, contact, and location notes; use the booking policy tools for reservation and experience booking rules
${translationConfirmationGuidance}- Before publish_post, delete_post, publish_menu, delete_menu, delete_menu_item, delete_menu_section, delete_location, delete_media_asset, delete_location_qa, or delete_content_field — confirm first
- Menus are live immediately when created — use publish_menu only to republish a menu that was set to unpublished
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
    userRole: opts.userRole,
    agentMessages,
    locationId,
    channel,
    pendingMedia: opts.pendingMedia,
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

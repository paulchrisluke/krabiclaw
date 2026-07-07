import {
  callAiGateway,
  type AiMessage,
} from "~/server/utils/ai-gateway";
import { hasCredits, chargeCredits } from "~/server/utils/ai-credits";
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  PostValidationError,
} from "~/server/utils/post-management";
import {
  listPlatformBlogPosts,
  getPlatformBlogPost,
  createPlatformBlogPost,
  updatePlatformBlogPost,
  deletePlatformBlogPost,
} from "~/server/utils/platform-content";
import {
  getMenus,
  getMenuWithItems,
  createMenu,
  updateMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  deleteMenu,
  MenuNotFoundError,
  renameMenuSection,
  deleteMenuSection,
  reorderMenuItems,
} from "~/server/utils/menu-management";
import {
  deleteSiteContentField,
  getPageContent,
  getSiteContentField,
  upsertSiteContent,
} from "~/server/utils/content-management";
import { setConfig } from "~/server/utils/site-config";
import {
  deleteSiteLocale,
  listSiteLocales,
  upsertSiteLocale,
} from "~/server/utils/site-locales";
import {
  buildTranslationInventory,
  createTranslationJob,
  publishTranslationDrafts,
} from "~/server/utils/translation-inventory";
import { processTranslationJobBatch } from "~/server/utils/translation-processor";
import { getPlaceDetails, searchPlaces } from "~/server/utils/google-places";
import { extractMenuFromMediaAsset } from "~/server/utils/chowbot-media";
import { upsertChannelState } from "~/server/utils/chowbot-conversations";
import { CHOWBOT_MODEL } from "~/server/utils/ai-models";
import { updateSiteSettingsFields } from "~/server/utils/site-settings";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "~/server/utils/location-management";
import {
  listLocationQa,
  createLocationQa,
  deleteLocationQa,
} from "~/server/utils/location-qa";
import { replyToReview } from "~/server/utils/review-management";
import { createWorkRequest } from "~/server/utils/work-request-management";
import {
  getExperienceById,
  updateExperience,
  WEEKDAY_NAMES,
  type RecurringSlots,
} from "~/server/utils/experiences";
import { buildImageUrl } from "~/server/utils/cloudflare-images";
import { getMediaAsset, updateMediaAssetMetadata } from "~/server/utils/media-asset-manager";
import {
  listWorkRequestsForOrganization,
  getNotificationsSettings,
  listReservationSubmissions,
  updateNotificationsSettings,
  updateLocationQa,
  reorderLocationQa,
  updateHomeHero,
} from "~/server/utils/mcp-workflows";
import {
  listTranslationReviewItems,
  saveTranslationReviewItem,
} from "~/server/utils/translation-review";
import { contentRegistry, getFieldDef } from "~/config/content-registry";
import type { MenuItem, UpdateMenuItemRequest } from "~/server/types/menu";
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
import { SUPPORTED_CURRENCIES } from "~/shared/currencies";
import { queryAll, queryFirst } from "~/server/db";
import {
  buildDashboardUrl,
  DASHBOARD_DESTINATIONS,
  type DashboardDestination,
} from "~/server/utils/dashboard-links";
import { searchPublicResources } from "~/server/utils/public-search";
import { PUBLIC_SEARCH_TYPES, type PublicSearchTypeFilter } from '~/server/utils/platform-search-types'

const MAX_ITERATIONS = 10;
const HERO_FIELDS = new Set([
  "hero.title",
  "hero.subtitle",
  "hero.image",
  "hero.video",
]);
const TRANSLATION_SCOPES = new Set([
  "site",
  "content",
  "menus",
  "locations",
  "posts",
]);

type SqlBindValue = string | number | boolean | null;
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

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /UNIQUE constraint failed/i.test(message);
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

async function resolveMediaAssetPublicUrl(
  db: D1Database,
  env: ApiRecord,
  siteId: string,
  assetId: string,
): Promise<string> {
  const asset = await getMediaAsset(db, assetId, siteId);
  if (!asset) throw new Error("Media asset not found.");
  if (asset.public_url) return asset.public_url;
  if (asset.cloudflare_image_id) {
    return buildImageUrl(env, asset.cloudflare_image_id, "public");
  }
  throw new Error("Media asset does not have a public URL.");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function menuItemKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function menuItemLookupKey(name: string): string {
  const key = menuItemKey(name);
  return key || name.trim().toLowerCase();
}

function getToolString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function getToolStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string");
  }
  return undefined;
}

function getToolBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

const TIME_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function asValidRecurringSlots(value: unknown): RecurringSlots | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!WEEKDAY_NAMES.includes(key as (typeof WEEKDAY_NAMES)[number])) return null;
    const slots = record[key];
    if (!Array.isArray(slots)) return null;
    if (!slots.every((s) => typeof s === "string" && TIME_SLOT_PATTERN.test(s))) return null;
  }
  return record as RecurringSlots;
}

function isSiteContentPage(page: string): page is keyof typeof contentRegistry {
  return Object.prototype.hasOwnProperty.call(contentRegistry, page);
}

function isHeroField(
  field: string,
): field is "hero.title" | "hero.subtitle" | "hero.image" | "hero.video" {
  return HERO_FIELDS.has(field);
}

function heroColumnForField(
  field: "hero.title" | "hero.subtitle" | "hero.image" | "hero.video",
) {
  if (field === "hero.title") return "hero_title";
  if (field === "hero.subtitle") return "hero_subtitle";
  if (field === "hero.image") return "hero_image_asset_id";
  return "hero_video_asset_id";
}

async function readHeroContentState(
  db: D1Database,
  orgId: string,
  siteId: string,
  page: string,
  locationId?: string,
) {
  const liveRow = await getSiteContentField(
    db,
    orgId,
    siteId,
    locationId ?? null,
    page,
    "hero",
  );

  const base = liveRow ?? null;
  return {
    id: typeof base?.id === "string" ? base.id : undefined,
    hero_title: typeof base?.hero_title === "string" ? base.hero_title : null,
    hero_subtitle:
      typeof base?.hero_subtitle === "string" ? base.hero_subtitle : null,
    hero_image_asset_id:
      typeof base?.hero_image_asset_id === "string"
        ? base.hero_image_asset_id
        : null,
    hero_video_asset_id:
      typeof base?.hero_video_asset_id === "string"
        ? base.hero_video_asset_id
        : null,
  };
}

function isEmptyHeroState(state: {
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_asset_id: string | null;
  hero_video_asset_id: string | null;
}) {
  return (
    !state.hero_title &&
    !state.hero_subtitle &&
    !state.hero_image_asset_id &&
    !state.hero_video_asset_id
  );
}

function getComponentFromField(field: string): string | null {
  // Direct mapping for specific fields
  const fieldToComponentMap: Record<string, string> = {
    hero: "SayaHomeHero",
    "hero.title": "SayaHomeHero",
    "hero.subtitle": "SayaHomeHero",
    "hero.eyebrow": "SayaHomeHero",
    "hero.image": "SayaHomeHero",
    "hero.video": "SayaHomeHero",
    "story.headline": "SayaBrandStory",
    "story.body": "SayaBrandStory",
    "story.image": "SayaBrandStory",
    "journey.title": "SayaBrandStory",
    "journey.body": "SayaBrandStory",
    "experience.body": "SayaBrandStory",
    "experience.title": "SayaBrandStory",
    "cta.title": "SayaCTA",
    "cta.description": "SayaCTA",
    "reviews.heading": "SayaReviews",
    "posts.eyebrow": "SayaPosts",
    "posts.heading": "SayaPosts",
    "locations.heading": "SayaLocationsGrid",
    "qa.heading": "SayaQA",
    "featured.heading": "SayaFeaturedContent",
  };

  if (fieldToComponentMap[field]) {
    return fieldToComponentMap[field];
  }

  // Pattern matching
  if (field.startsWith("hero.")) return "SayaHomeHero";
  if (field.startsWith("story.")) return "SayaBrandStory";
  if (field.startsWith("journey.")) return "SayaBrandStory";
  if (field.startsWith("experience.")) return "SayaBrandStory";
  if (field.startsWith("cta.")) return "SayaCTA";
  if (field.startsWith("reviews.")) return "SayaReviews";
  if (field.startsWith("posts.")) return "SayaPosts";
  if (field.startsWith("locations.")) return "SayaLocationsGrid";
  if (field.startsWith("qa.")) return "SayaQA";
  if (field.startsWith("featured.")) return "SayaFeaturedContent";

  return null;
}

async function upsertHeroContentState(
  db: D1Database,
  orgId: string,
  siteId: string,
  page: string,
  locationId: string | undefined,
  state: {
    hero_title: string | null;
    hero_subtitle: string | null;
    hero_image_asset_id: string | null;
    hero_video_asset_id: string | null;
  },
) {
  const id = `content::${orgId}::${siteId}::${locationId ?? "site"}::${page}::hero`;
  const payload = {
    id,
    organization_id: orgId,
    site_id: siteId,
    location_id: locationId,
    page,
    field: "hero",
    value: undefined,
    type: "text",
    source: "manual",
    content: undefined,
    hero_title: state.hero_title ?? undefined,
    hero_subtitle: state.hero_subtitle ?? undefined,
    hero_image_asset_id: state.hero_image_asset_id ?? undefined,
    hero_video_asset_id: state.hero_video_asset_id ?? undefined,
    component: "SayaHomeHero",
  };

  await upsertSiteContent(db, payload);
}


function getToolNumber(
  record: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function getToolInteger(
  record: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const numeric = getToolNumber(record, key);
  if (numeric === undefined || numeric === null) return numeric;
  return Number.isInteger(numeric) ? numeric : undefined;
}

function findMenuItemMatch(
  itemRecord: Record<string, unknown>,
  menuItems: MenuItem[],
): MenuItem | null {
  const itemId = getToolString(itemRecord, "item_id", 120);
  if (itemId) {
    return menuItems.find((item) => item.id === itemId) ?? null;
  }

  const name = getToolString(itemRecord, "name", 200)?.trim();
  if (!name) return null;

  const key = menuItemLookupKey(name);
  const lowerName = name.toLowerCase();
  return (
    menuItems.find(
      (item) => item.slug === key || item.name.toLowerCase() === lowerName,
    ) ?? null
  );
}

function buildMenuItemUpdates(
  itemRecord: Record<string, unknown>,
  match?: MenuItem | null,
): UpdateMenuItemRequest {
  const updates: UpdateMenuItemRequest = {};
  const section = getToolString(itemRecord, "section", 100);
  const name = getToolString(itemRecord, "name", 200);
  const description = getToolString(itemRecord, "description", 500);
  const priceAmount = getToolString(itemRecord, "price_amount", 50);
  const compareAtPriceAmount = getToolString(itemRecord, "compare_at_price_amount", 50);
  const saleStartsAt = getToolString(itemRecord, "sale_starts_at", 50);
  const saleEndsAt = getToolString(itemRecord, "sale_ends_at", 50);
  const imageAssetId = getToolString(itemRecord, "image_asset_id", 120);
  const available = getToolBoolean(itemRecord, "available");

  const allergens = getToolStringArray(itemRecord, "allergens");
  const ingredients = getToolStringArray(itemRecord, "ingredients");
  const dietary_notes = getToolStringArray(itemRecord, "dietary_notes");
  const preparation = getToolString(itemRecord, "preparation", 500);
  const serving_note = getToolString(itemRecord, "serving_note", 500);

  if (section !== undefined && section.trim() && section !== match?.section)
    updates.section = section;
  if (name !== undefined && name !== match?.name) updates.name = name;
  if (description !== undefined && description !== match?.description)
    updates.description = description;
  if (priceAmount !== undefined && priceAmount !== match?.price_amount)
    updates.price_amount = priceAmount;
  if (compareAtPriceAmount !== undefined && compareAtPriceAmount !== match?.compare_at_price_amount)
    updates.compare_at_price_amount = compareAtPriceAmount;
  if (saleStartsAt !== undefined && saleStartsAt !== match?.sale_starts_at)
    updates.sale_starts_at = saleStartsAt;
  if (saleEndsAt !== undefined && saleEndsAt !== match?.sale_ends_at)
    updates.sale_ends_at = saleEndsAt;
  if (imageAssetId !== undefined && imageAssetId !== match?.image_asset_id)
    updates.image_asset_id = imageAssetId;
  if (available !== undefined && available !== Boolean(match?.available))
    updates.available = available;

  if (allergens !== undefined) updates.allergens = allergens;
  if (ingredients !== undefined) updates.ingredients = ingredients;
  if (dietary_notes !== undefined) updates.dietary_notes = dietary_notes;
  if (preparation !== undefined && preparation !== match?.preparation)
    updates.preparation = preparation;
  if (serving_note !== undefined && serving_note !== match?.serving_note)
    updates.serving_note = serving_note;

  return updates;
}

function hasMenuItemUpdates(updates: UpdateMenuItemRequest): boolean {
  return Object.keys(updates).length > 0;
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
    case "list_posts": {
      const posts = await listPosts(db, orgId, siteId, env, input.status);
      const filtered = input.location_id
        ? posts.filter((p) => p.location_id === input.location_id)
        : posts;
      return filtered.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body.slice(0, 120) + (p.body.length > 120 ? "…" : ""),
        status: p.status,
        post_type: p.post_type,
        location_id: p.location_id,
        updated_at: p.updated_at,
      }));
    }

    case "create_post": {
      let post;
      try {
        post = await createPost(
          db,
          orgId,
          siteId,
          {
            title: input.title,
            body: input.body,
            image_asset_id: input.image_asset_id,
            slug: input.slug,
            seo_title: input.seo_title,
            seo_description: input.seo_description,
            og_image_asset_id: input.og_image_asset_id,
            gallery_media: input.gallery_media,
            location_id: input.location_id,
            post_type: input.post_type,
            cta_type: input.cta_type,
            cta_url: input.cta_url,
            event_title: input.event_title,
            event_start: input.event_start,
            event_end: input.event_end,
            offer_coupon: input.offer_coupon,
            offer_terms: input.offer_terms,
          },
          userId,
          env,
        );
      } catch (error) {
        if (error instanceof PostValidationError) return { error: error.message };
        throw error;
      }
      return {
        id: post.id,
        title: post.title,
        body: post.body,
        status: post.status,
        post_type: post.post_type,
        public_path: post.public_path,
        public_url: post.canonical_url,
      };
    }

    case "publish_post": {
      const result = await publishPost(db, orgId, siteId, input.post_id, [
        "site",
      ], env);
      if (!result) return { error: "Post not found or already published." };
      return {
        id: result.id,
        title: result.title,
        status: result.status,
        published_at: result.published_at,
        public_path: result.public_path,
        public_url: result.canonical_url,
      };
    }

    case "update_post": {
      let post;
      try {
        post = await updatePost(
          db,
          orgId,
          siteId,
          input.post_id,
          {
            title: input.title,
            body: input.body,
            image_asset_id: input.image_asset_id,
            slug: input.slug,
            seo_title: input.seo_title,
            seo_description: input.seo_description,
            og_image_asset_id: input.og_image_asset_id,
            gallery_media: input.gallery_media,
            location_id: input.location_id,
            post_type: input.post_type,
            cta_type: input.cta_type,
            cta_url: input.cta_url,
            event_title: input.event_title,
            event_start: input.event_start,
            event_end: input.event_end,
            offer_coupon: input.offer_coupon,
            offer_terms: input.offer_terms,
          },
          userId,
          env,
        );
      } catch (error) {
        if (error instanceof PostValidationError) return { error: error.message };
        throw error;
      }
      if (!post) return { error: "Post not found." };
      return {
        id: post.id,
        title: post.title,
        body: post.body,
        status: post.status,
        public_path: post.public_path,
        public_url: post.canonical_url,
        updated: true,
      };
    }

    case "delete_post": {
      if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
        return { error: "Only owners or admins can delete posts." };
      }
      const deleted = await deletePost(db, orgId, siteId, input.post_id);
      if (!deleted) return { error: "Post not found." };
      return { post_id: input.post_id, deleted: true };
    }

    case "get_menu": {
      if (input.menu_id) {
        const menu = await getMenuWithItems(db, orgId, siteId, input.menu_id);
        if (!menu) return { error: "Menu not found." };
        return menu;
      }
      // Filter by current location when available so we only see relevant menus
      const locationFilter =
        (input.location_id as string | undefined) ??
        ctx.locationId ??
        undefined;
      const menus = await getMenus(
        db,
        orgId,
        siteId,
        locationFilter || undefined,
      );
      if (!menus.length) return { message: "No menus found for this site." };
      return (
        (await getMenuWithItems(db, orgId, siteId, menus[0]!.id)) ?? {
          error: "Failed to load menu.",
        }
      );
    }

    case "create_menu": {
      // Use the explicit location from the AI, fall back to the page's current location
      const effectiveLocationId =
        (input.location_id as string | undefined) ??
        ctx.locationId ??
        undefined;
      if (effectiveLocationId) {
        const location = await queryFirst(
          db,
          `
          SELECT 1 FROM business_locations
          WHERE id = ? AND organization_id = ? AND site_id = ?
          LIMIT 1
        `,
          [effectiveLocationId, orgId, siteId],
        );
        if (!location) return { error: "Location not found or access denied" };
      }
      const menu = await createMenu(
        db,
        orgId,
        siteId,
        {
          name: input.name,
          description: input.description,
          locationId: effectiveLocationId,
        },
        userId,
      );
      return {
        id: menu.id,
        name: menu.name,
        description: menu.description,
        status: menu.status,
      };
    }

    case "update_menu": {
      const menu = await updateMenu(
        db,
        orgId,
        siteId,
        input.menu_id,
        { name: input.name, description: input.description },
        userId,
      );
      return {
        id: menu.id,
        name: menu.name,
        description: menu.description,
        status: menu.status,
      };
    }

    case "rename_menu_section": {
      const menuId = toSqlText(input.menu_id);
      const oldSection = toSqlText(input.old_section)?.trim();
      const newSection = toSqlText(input.new_section)?.trim();
      if (!menuId || !oldSection || !newSection) {
        return { error: "menu_id, old_section, and new_section are required." };
      }
      if (oldSection === newSection) {
        return { error: "New section must be different." };
      }

      const menu = await getMenuWithItems(db, orgId, siteId, menuId);
      if (!menu) return { error: "Menu not found." };
      if (!menu.items.some((item) => item.section === oldSection)) {
        return { error: "Section not found." };
      }
      if (menu.items.some((item) => item.section === newSection)) {
        return { error: "Section already exists." };
      }

      let updated: number;
      try {
        updated = await renameMenuSection(
          db,
          orgId,
          siteId,
          menuId,
          oldSection,
          newSection,
          userId,
        );
      } catch (error) {
        if (error instanceof MenuNotFoundError) return { error: error.message };
        throw error;
      }
      return {
        menu_id: menuId,
        old_section: oldSection,
        new_section: newSection,
        updated,
      };
    }

    case "delete_menu_section": {
      const menuId = toSqlText(input.menu_id);
      const section = toSqlText(input.section)?.trim();
      if (!menuId || !section)
        return { error: "menu_id and section are required." };

      const menu = await getMenuWithItems(db, orgId, siteId, menuId);
      if (!menu) return { error: "Menu not found." };
      if (!menu.items.some((item) => item.section === section)) {
        return { error: "Section not found." };
      }

      const deleted = await deleteMenuSection(db, orgId, siteId, menuId, section).catch((error) => {
        if (error instanceof MenuNotFoundError) return null;
        throw error;
      });
      if (deleted === null) return { error: "Menu not found." };
      return { menu_id: menuId, section, deleted };
    }

    case "add_menu_items_batch": {
      const menuId = toSqlText(input.menu_id);
      if (!menuId) return { error: "menu_id is required." };
      const menu = await getMenuWithItems(db, orgId, siteId, menuId);
      if (!menu) return { error: "Menu not found." };

      const items: unknown[] = Array.isArray(input.items)
        ? input.items.slice(0, 100)
        : [];
      const existingKeys = new Set(
        menu.items.map((item) => item.slug || menuItemLookupKey(item.name)),
      );
      const inputKeys = new Set<string>();
      const created: Array<{
        id: string;
        name: string;
        section: string;
        price_amount: string | number | null;
      }> = [];
      const skipped: Array<{
        name: string;
        reason: string;
        existing_item_id?: string;
      }> = [];

      for (const item of items) {
        const itemRecord =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : null;
        const name = itemRecord
          ? getToolString(itemRecord, "name", 200)?.trim()
          : "";
        if (!itemRecord || !name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }
        const section = itemRecord
          ? getToolString(itemRecord, "section", 100)?.trim()
          : "";
        if (!section) {
          skipped.push({ name, reason: "missing_section" });
          continue;
        }

        const key = menuItemLookupKey(name);
        const existing = menu.items.find(
          (menuItem) =>
            menuItem.slug === key ||
            menuItem.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing || existingKeys.has(key)) {
          skipped.push({
            name,
            reason: "already_exists",
            existing_item_id: existing?.id,
          });
          continue;
        }
        if (inputKeys.has(key)) {
          skipped.push({ name, reason: "duplicate_in_request" });
          continue;
        }

        inputKeys.add(key);

        try {
          const createdItem = await createMenuItem(
            db,
            orgId,
            siteId,
            menuId,
            {
              section,
              name,
              description: getToolString(itemRecord, "description", 500),
              price_amount: getToolString(itemRecord, "price_amount", 50),
              compare_at_price_amount: getToolString(itemRecord, "compare_at_price_amount", 50),
              sale_starts_at: getToolString(itemRecord, "sale_starts_at", 50),
              sale_ends_at: getToolString(itemRecord, "sale_ends_at", 50),
              image_asset_id: getToolString(itemRecord, "image_asset_id", 120),
            },
            userId,
          );
          existingKeys.add(
            createdItem.slug || menuItemLookupKey(createdItem.name),
          );
          created.push({
            id: createdItem.id,
            name: createdItem.name,
            section: createdItem.section,
            price_amount: createdItem.price_amount,
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          skipped.push({ name, reason: "unique_conflict" });
        }
      }

      return { added: created.length, created, skipped, menu_id: menuId };
    }

    case "sync_menu_items": {
      const menuId = toSqlText(input.menu_id);
      if (!menuId) return { error: "menu_id is required." };
      const menu = await getMenuWithItems(db, orgId, siteId, menuId);
      if (!menu) return { error: "Menu not found." };

      const items: unknown[] = Array.isArray(input.items)
        ? input.items.slice(0, 100)
        : [];
      const workingItems = [...menu.items];
      const touchedItemIds = new Set<string>();
      const created: Array<{
        id: string;
        name: string;
        section: string;
        price_amount: string | number | null;
      }> = [];
      const updated: Array<{
        id: string;
        name: string;
        section: string;
        price_amount: string | number | null;
        available: boolean;
      }> = [];
      const unchanged: Array<{ id: string; name: string }> = [];
      const skipped: Array<{ name: string; reason: string; item_id?: string }> =
        [];

      for (const item of items) {
        const itemRecord =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : null;
        if (!itemRecord) {
          skipped.push({ name: "", reason: "invalid_item" });
          continue;
        }

        const name = getToolString(itemRecord, "name", 200)?.trim();
        const match = findMenuItemMatch(itemRecord, workingItems);

        if (match) {
          const updates = buildMenuItemUpdates(itemRecord, match);
          touchedItemIds.add(match.id);

          if (!hasMenuItemUpdates(updates)) {
            unchanged.push({ id: match.id, name: match.name });
            continue;
          }

          try {
            const updatedItem = await updateMenuItem(
              db,
              orgId,
              siteId,
              match.id,
              updates,
              userId,
            );
            const index = workingItems.findIndex(
              (menuItem) => menuItem.id === updatedItem.id,
            );
            if (index >= 0) workingItems[index] = updatedItem;
            updated.push({
              id: updatedItem.id,
              name: updatedItem.name,
              section: updatedItem.section,
              price_amount: updatedItem.price_amount,
              available: Boolean(updatedItem.available),
            });
          } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;
            skipped.push({
              name: name || match.name,
              reason: "unique_conflict",
              item_id: match.id,
            });
          }
          continue;
        }

        if (!name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }
        const section = getToolString(itemRecord, "section", 100)?.trim();
        if (!section) {
          skipped.push({ name, reason: "missing_section" });
          continue;
        }

        try {
          const createdItem = await createMenuItem(
            db,
            orgId,
            siteId,
            menuId,
            {
              section,
              name,
              description: getToolString(itemRecord, "description", 500),
              price_amount: getToolString(itemRecord, "price_amount", 50),
              compare_at_price_amount: getToolString(itemRecord, "compare_at_price_amount", 50),
              sale_starts_at: getToolString(itemRecord, "sale_starts_at", 50),
              sale_ends_at: getToolString(itemRecord, "sale_ends_at", 50),
              image_asset_id: getToolString(itemRecord, "image_asset_id", 120),
              available: getToolBoolean(itemRecord, "available"),
            },
            userId,
          );
          workingItems.push(createdItem);
          touchedItemIds.add(createdItem.id);
          created.push({
            id: createdItem.id,
            name: createdItem.name,
            section: createdItem.section,
            price_amount: createdItem.price_amount,
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          skipped.push({ name, reason: "unique_conflict" });
        }
      }

      const madeUnavailable: Array<{ id: string; name: string }> = [];
      if (input.set_missing_unavailable === true) {
        for (const item of workingItems) {
          if (touchedItemIds.has(item.id) || !item.available) continue;
          const updatedItem = await updateMenuItem(
            db,
            orgId,
            siteId,
            item.id,
            { available: false },
            userId,
          );
          madeUnavailable.push({ id: updatedItem.id, name: updatedItem.name });
        }
      }

      return {
        menu_id: menuId,
        created,
        updated,
        unchanged,
        made_unavailable: madeUnavailable,
        skipped,
        summary: {
          created: created.length,
          updated: updated.length,
          unchanged: unchanged.length,
          made_unavailable: madeUnavailable.length,
          skipped: skipped.length,
        },
      };
    }

    case "create_menu_item": {
      const item = await createMenuItem(
        db,
        orgId,
        siteId,
        input.menu_id,
        {
          section: input.section,
          name: input.name,
          description: input.description,
          price_amount: input.price_amount,
          compare_at_price_amount: input.compare_at_price_amount,
          sale_starts_at: input.sale_starts_at,
          sale_ends_at: input.sale_ends_at,
          image_asset_id: input.image_asset_id,
        },
        userId,
      );
      return {
        id: item.id,
        name: item.name,
        section: item.section,
        price_amount: item.price_amount,
      };
    }

    case "update_menu_item": {
      const updates: Record<string, string | boolean | number | null> = {};
      for (const f of [
        "section",
        "name",
        "description",
        "price_amount",
        "compare_at_price_amount",
        "sale_starts_at",
        "sale_ends_at",
        "image_asset_id",
        "available",
        "featured",
        "featured_sort_order",
        "allergens",
        "ingredients",
        "dietary_notes",
        "preparation",
        "serving_note",
      ]) {
        if (input[f] !== undefined) updates[f] = input[f];
      }
      const item = await updateMenuItem(db, orgId, siteId, input.item_id, updates, userId);
      return {
        id: item.id,
        name: item.name,
        price_amount: item.price_amount,
        available: item.available,
        featured: item.featured,
        featured_sort_order: item.featured_sort_order,
        allergens: item.allergens,
        ingredients: item.ingredients,
        dietary_notes: item.dietary_notes,
        preparation: item.preparation,
        serving_note: item.serving_note,
      };
    }

    case "delete_menu_item": {
      const menuId = toSqlText(input.menu_id);
      const itemId = toSqlText(input.item_id);
      if (!menuId || !itemId)
        return { error: "menu_id and item_id are required." };

      const menu = await getMenuWithItems(db, orgId, siteId, menuId);
      if (!menu) return { error: "Menu not found." };
      const item = menu.items.find((menuItem) => menuItem.id === itemId);
      if (!item) return { error: "Menu item not found." };

      await deleteMenuItem(db, itemId, orgId, siteId, userId);
      return {
        menu_id: menuId,
        item_id: itemId,
        name: item.name,
        deleted: true,
      };
    }

    case "publish_menu": {
      const menu = await updateMenu(
        db,
        orgId,
        siteId,
        input.menu_id,
        { status: "published" },
        userId,
      );
      if (!menu) {
        return { error: "Menu not found or access denied." };
      }
      return { menu_id: input.menu_id, status: "published" };
    }

    case "delete_menu": {
      await deleteMenu(db, orgId, siteId, input.menu_id);
      return { menu_id: input.menu_id, deleted: true };
    }

    case "list_locations": {
      const rows = await queryAll(
        db,
        `SELECT id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_place_id,
                rating, review_count, description, short_description, price_level,
                instagram_url, facebook_url, tiktok_url, hero_image_asset_id, hero_video_asset_id,
                status, is_primary
         FROM business_locations WHERE organization_id = ? AND site_id = ? ORDER BY is_primary DESC, title ASC`,
        [orgId, siteId],
      );
      return rows ?? [];
    }

    case "create_location": {
      const title = toSqlText(input.title)?.trim();
      if (!title) return { error: "title is required." };
      if (input.rating !== undefined && getToolNumber(input, "rating") === undefined)
        return { error: "rating must be a valid number." };
      const ratingCreate = getToolNumber(input, "rating");
      if (ratingCreate !== undefined && ratingCreate !== null && (ratingCreate < 0 || ratingCreate > 5))
        return { error: "rating must be between 0 and 5." };
      if (input.review_count !== undefined && getToolInteger(input, "review_count") === undefined)
        return { error: "review_count must be a valid integer." };
      const reviewCountCreate = getToolInteger(input, "review_count");
      if (reviewCountCreate !== undefined && reviewCountCreate !== null && reviewCountCreate < 0)
        return { error: "review_count must be non-negative." };
      const result = await createLocation(
        env,
        db,
        orgId,
        siteId,
        {
          title,
          city: toSqlText(input.city) ?? null,
          neighborhood: toSqlText(input.neighborhood) ?? null,
          phone: toSqlText(input.phone) ?? null,
          email: toSqlText(input.email) ?? null,
          website_url: toSqlText(input.website_url) ?? null,
          maps_url: toSqlText(input.maps_url) ?? null,
          google_place_id: toSqlText(input.google_place_id) ?? null,
          description: toSqlText(input.description) ?? null,
          short_description: toSqlText(input.short_description) ?? null,
          address: toSqlText(input.address) ?? null,
          opening_hours: toSqlText(input.opening_hours) ?? null,
          rating: getToolNumber(input, "rating") ?? null,
          review_count: getToolInteger(input, "review_count") ?? null,
          price_level: toSqlText(input.price_level) ?? null,
          facebook_url: toSqlText(input.facebook_url) ?? null,
          instagram_url: toSqlText(input.instagram_url) ?? null,
          tiktok_url: toSqlText(input.tiktok_url) ?? null,
          grab_url: toSqlText(input.grab_url) ?? null,
          uber_eats_url: toSqlText(input.uber_eats_url) ?? null,
          foodpanda_url: toSqlText(input.foodpanda_url) ?? null,
          hero_image_asset_id: toSqlText(input.hero_image_asset_id) ?? null,
          hero_video_asset_id: toSqlText(input.hero_video_asset_id) ?? null,
          is_primary: getToolBoolean(input, "is_primary") === true,
        },
        userId,
      );
      if (result.status >= 400) return result.data;
      const location = (
        result.data as {
          location?: {
            id: string;
            title: string;
            slug: string;
            status: string;
          };
        }
      ).location;
      return location ?? { error: "Location could not be created." };
    }

    case "update_location": {
      const locationId = toSqlText(input.location_id);
      if (!locationId) {
        return { error: "location_id is required." };
      }
      if (input.rating !== undefined && getToolNumber(input, "rating") === undefined)
        return { error: "rating must be a valid number." };
      const ratingUpdate = getToolNumber(input, "rating");
      if (ratingUpdate !== undefined && ratingUpdate !== null && (ratingUpdate < 0 || ratingUpdate > 5))
        return { error: "rating must be between 0 and 5." };
      if (input.review_count !== undefined && getToolInteger(input, "review_count") === undefined)
        return { error: "review_count must be a valid integer." };
      const reviewCountUpdate = getToolInteger(input, "review_count");
      if (reviewCountUpdate !== undefined && reviewCountUpdate !== null && reviewCountUpdate < 0)
        return { error: "review_count must be non-negative." };
      const result = await updateLocation(
        db,
        orgId,
        siteId,
        locationId,
        {
          title: toSqlText(input.title) ?? undefined,
          slug: toSqlText(input.slug) ?? undefined,
          city: toSqlText(input.city) ?? undefined,
          neighborhood: toSqlText(input.neighborhood) ?? undefined,
          phone: input.phone !== undefined ? (toSqlText(input.phone) ?? null) : undefined,
          email: input.email !== undefined ? (toSqlText(input.email) ?? null) : undefined,
          notification_phone: toSqlText(input.notification_phone) ?? undefined,
          description: toSqlText(input.description) ?? undefined,
          short_description: toSqlText(input.short_description) ?? undefined,
          price_level: toSqlText(input.price_level) ?? undefined,
          facebook_url: toSqlText(input.facebook_url) ?? undefined,
          instagram_url: toSqlText(input.instagram_url) ?? undefined,
          tiktok_url: toSqlText(input.tiktok_url) ?? undefined,
          grab_url: toSqlText(input.grab_url) ?? undefined,
          uber_eats_url: toSqlText(input.uber_eats_url) ?? undefined,
          foodpanda_url: toSqlText(input.foodpanda_url) ?? undefined,
          website_url: toSqlText(input.website_url) ?? undefined,
          maps_url: toSqlText(input.maps_url) ?? undefined,
          google_place_id: toSqlText(input.google_place_id) ?? undefined,
          hero_image_asset_id:
            toSqlText(input.hero_image_asset_id) ?? undefined,
          hero_video_asset_id:
            toSqlText(input.hero_video_asset_id) ?? undefined,
          address: toSqlText(input.address) ?? undefined,
          opening_hours: toSqlText(input.opening_hours) ?? undefined,
          rating:
            input.rating !== undefined
              ? (getToolNumber(input, "rating") ?? null)
              : undefined,
          review_count:
            input.review_count !== undefined
              ? (getToolInteger(input, "review_count") ?? null)
              : undefined,
          is_primary: getToolBoolean(input, "is_primary"),
          status:
            typeof input.status === "string" &&
            ["active", "inactive", "sync_error"].includes(input.status)
              ? (input.status as "active" | "inactive" | "sync_error")
              : undefined,
        },
        userId,
      );

      if (result.status >= 400) return result.data;
      return (
        (result.data as { location?: JsonSerializable }).location ?? {
          error: "Location not found.",
        }
      );
    }

    case "delete_location": {
      const locationId = toSqlText(input.location_id);
      if (!locationId) return { error: "location_id is required." };
      const result = await deleteLocation(
        env,
        db,
        orgId,
        siteId,
        locationId,
        userId,
      );
      return result.status >= 400
        ? result.data
        : { location_id: locationId, deleted: true };
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

      // Resolve one redirect hop safely for short URLs.
      let resolvedUrl = parsedRawUrl.toString();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const probe = await fetch(parsedRawUrl.toString(), {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const location = probe.headers.get("location");
        if (location) {
          const redirected = new URL(location, parsedRawUrl);
          if (!isAllowedGoogleMapsHost(redirected.hostname)) {
            return { error: "URL redirects to a non-Google host." };
          }
          resolvedUrl = redirected.toString();
        } else {
          const probeUrl = probe.url || parsedRawUrl.toString();
          const parsedProbeUrl = new URL(probeUrl);
          if (!isAllowedGoogleMapsHost(parsedProbeUrl.hostname)) {
            return { error: "Resolved URL is not a Google Maps host." };
          }
          resolvedUrl = parsedProbeUrl.toString();
        }
      } catch {
        /* keep rawUrl */
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

    case "list_location_reviews": {
      const loc = await queryFirst(
        db,
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        [input.location_id, orgId, siteId],
      );
      if (!loc) return { error: "Location not found." };
      const results = await queryAll(
        db,
        `SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
                owner_reply_at, photo_urls, source, status, created_at, updated_at
         FROM reviews
         WHERE site_id = ? AND location_id = ?
         ORDER BY created_at DESC`,
        [siteId, input.location_id],
      );
      return results ?? [];
    }

    case "reply_to_review": {
      const result = await replyToReview(
        db,
        orgId,
        siteId,
        input.review_id,
        String(input.reply ?? ""),
      );
      return result.data;
    }

    case "get_site_media_assets": {
      const conditions = [
        `site_id = ?`,
        `location_id = ?`,
        `status = 'active'`,
      ];
      const params: SqlBindValue[] = [siteId, input.location_id];
      if (input.kind) {
        conditions.push(`kind = ?`);
        params.push(input.kind);
      }
      params.push(50);
      const results = await queryAll(
        db,
        `SELECT id, kind, provider, public_url, thumbnail_url, alt_text, mime_type, file_name, created_at
         FROM media_assets WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
        params,
      );
      return results ?? [];
    }

    case "delete_media_asset": {
      const { deleteMediaAsset } =
        await import("~/server/utils/media-asset-manager");
      await deleteMediaAsset(db, env, input.asset_id, siteId, userId);
      return { asset_id: input.asset_id, deleted: true };
    }

    case "import_menu_from_media": {
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: "No pending WhatsApp media is available to import." };
      }
      const result = await extractMenuFromMediaAsset(db, env, {
        organizationId: orgId,
        siteId,
        userId,
        assetId: ctx.pendingMedia.assetId,
        menuName: toSqlText(input.menu_name)?.trim() || undefined,
      });
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

    case "list_location_qa": {
      const loc = await queryFirst(
        db,
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        [input.location_id, orgId, siteId],
      );
      if (!loc) return { error: "Location not found." };
      return listLocationQa(db, siteId, input.location_id);
    }

    case "create_location_qa": {
      const loc = await queryFirst(
        db,
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        [input.location_id, orgId, siteId],
      );
      if (!loc) return { error: "Location not found." };
      const result = await createLocationQa(
        db,
        orgId,
        siteId,
        input.location_id,
        {
          question: String(input.question ?? ""),
          answer: toSqlText(input.answer) ?? null,
          is_owner_answer: true,
        },
      );
      return result.status >= 400
        ? result.data
        : { ...(result.data as object), added: true };
    }

    case "delete_location_qa": {
      const loc = await queryFirst(
        db,
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        [input.location_id, orgId, siteId],
      );
      if (!loc) return { error: "Location not found." };
      const result = await deleteLocationQa(
        db,
        siteId,
        input.location_id,
        input.qa_id,
      );
      return result.status >= 400
        ? result.data
        : { qa_id: input.qa_id, deleted: true };
    }

    case "get_contact_inquiries": {
      const results = await queryAll(
        db,
        `SELECT id, name, email, message, created_at FROM contact_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20`,
        [siteId],
      );
      return results ?? [];
    }

    case "get_reservation_inquiries": {
      const locationId = toSqlText(input.location_id) ?? ctx.locationId ?? null;
      const results = await listReservationSubmissions(db, siteId, { locationId });
      return results ?? [];
    }

    case "get_page_fields": {
      const page = getToolString(input, "page", 40);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };

      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);

      const live = await getPageContent(
        db,
        orgId,
        siteId,
        page,
        targetLocationId,
      );

      return {
        page,
        location_id: targetLocationId ?? null,
        fields: (contentRegistry[page]?.fields
          ? Object.keys(contentRegistry[page].fields)
          : []
        ).map((field) => ({
          field,
          label: getFieldDef(page, field)?.label ?? field,
          type: getFieldDef(page, field)?.type ?? "text",
        })),
        live,
      };
    }

    case "update_page_content": {
      const page = getToolString(input, "page", 40);
      const field = getToolString(input, "field", 80);
      const value = getToolString(input, "value", 20000);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };
      if (!field) return { error: "Field is required." };

      const fieldDef = getFieldDef(page, field);
      if (!fieldDef) return { error: `Unknown field: ${field}` };

      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);

      if (isHeroField(field)) {
        const heroState = await readHeroContentState(
          db,
          orgId,
          siteId,
          page,
          targetLocationId,
        );
        const nextState = { ...heroState };
        nextState[heroColumnForField(field)] = value ?? null;
        await upsertHeroContentState(
          db,
          orgId,
          siteId,
          page,
          targetLocationId,
          nextState,
        );
      } else {
        const id = `${orgId}::${siteId}::${targetLocationId ?? "site"}::${page}::${field}`;
        const component = getComponentFromField(field);

        await upsertSiteContent(db, {
          id,
          organization_id: orgId,
          site_id: siteId,
          location_id: targetLocationId,
          page,
          field,
          value: value ?? undefined,
          type: fieldDef.type,
          source: "manual",
          content: value ?? undefined,
          hero_title: undefined,
          hero_subtitle: undefined,
          hero_image_asset_id: undefined,
          hero_video_asset_id: undefined,
          component,
        });
      }

      return {
        page,
        field,
        value,
        location_id: targetLocationId ?? null,
        saved: true,
      };
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

      if (isHeroField(field)) {
        const heroState = await readHeroContentState(
          db,
          orgId,
          siteId,
          page,
          targetLocationId,
        );
        const nextState = { ...heroState };
        nextState[heroColumnForField(field)] = null;
        if (isEmptyHeroState(nextState)) {
          await deleteSiteContentField(
            db,
            orgId,
            siteId,
            page,
            "hero",
            targetLocationId,
          );
        } else {
          await upsertHeroContentState(
            db,
            orgId,
            siteId,
            page,
            targetLocationId,
            nextState,
          );
        }
      } else {
        await deleteSiteContentField(
          db,
          orgId,
          siteId,
          page,
          field,
          targetLocationId,
        );
      }

      return {
        page,
        field,
        location_id: targetLocationId ?? null,
        deleted: true,
      };
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
      const supportedCurrencies = new Set<string>(SUPPORTED_CURRENCIES);
      if (!currency || !supportedCurrencies.has(currency)) {
        return { error: "Unsupported currency." };
      }
      const result = await updateSiteSettingsFields(
        db,
        env,
        siteId,
        orgId,
        { default_currency: currency as (typeof SUPPORTED_CURRENCIES)[number] },
        userId,
      );
      if (result.status >= 400) {
        return {
          error: String(result.data.error ?? "Failed to update site settings."),
        };
      }
      return { default_currency: currency, updated: true };
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

    case "list_locales": {
      return await listSiteLocales(db, orgId, siteId);
    }

    case "upsert_locale": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      const saved = await upsertSiteLocale(db, orgId, siteId, {
        locale,
        label: toSqlText(input.label) ?? undefined,
        status:
          input.status === "published" ||
          input.status === "disabled" ||
          input.status === "draft"
            ? input.status
            : undefined,
        fallback_enabled:
          typeof input.fallback_enabled === "boolean"
            ? input.fallback_enabled
            : undefined,
        is_source:
          typeof input.is_source === "boolean" ? input.is_source : undefined,
      });
      return { locale: saved, updated: true };
    }

    case "delete_locale": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      return await deleteSiteLocale(db, orgId, siteId, locale);
    }

    case "get_translation_inventory": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      const scopeInput = toSqlText(input.scope)?.trim();
      const scope =
        scopeInput && TRANSLATION_SCOPES.has(scopeInput)
          ? (scopeInput as "site" | "content" | "menus" | "locations" | "posts")
          : "site";
      const inventory = await buildTranslationInventory(db, orgId, siteId, {
        targetLocale: locale,
        scope,
        includePublished: input.include_published === true,
      });
      return {
        estimate: inventory.estimate,
        sample: inventory.items.slice(0, 12).map((item) => ({
          entity_type: item.entity_type,
          label: item.label,
          chars: item.source_chars,
          status: item.translation_status,
        })),
      };
    }

    case "start_translation_job": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      const scopeInput = toSqlText(input.scope)?.trim();
      const scope =
        scopeInput && TRANSLATION_SCOPES.has(scopeInput)
          ? (scopeInput as "site" | "content" | "menus" | "locations" | "posts")
          : "site";
      return await createTranslationJob(db, orgId, siteId, userId, {
        targetLocale: locale,
        scope,
        includePublished: input.include_published === true,
      });
    }

    case "list_translation_jobs": {
      const results = await queryAll(
        db,
        `
        SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
               estimated_credits, actual_credits, processed_items, failed_items, created_at, updated_at
        FROM translation_jobs
        WHERE organization_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `,
        [orgId, siteId],
      );
      return results ?? [];
    }

    case "get_translation_job": {
      const jobId = toSqlText(input.job_id)?.trim();
      if (!jobId) return { error: "job_id is required." };
      const job = await queryFirst(
        db,
        `
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `,
        [jobId, orgId, siteId],
      );
      if (!job) return { error: "Translation job not found." };
      const results = await queryAll(
        db,
        `
        SELECT entity_type, entity_id, location_id, page, field, source_chars, status, error
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 100
      `,
        [jobId, orgId, siteId],
      );
      return { job, items: results ?? [] };
    }

    case "run_translation_job_batch": {
      const jobId = toSqlText(input.job_id)?.trim();
      if (!jobId) return { error: "job_id is required." };
      return await processTranslationJobBatch(db, env, orgId, siteId, jobId);
    }

    case "publish_translations": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      const scopeInput = toSqlText(input.scope)?.trim();
      const scope =
        scopeInput && TRANSLATION_SCOPES.has(scopeInput)
          ? (scopeInput as "site" | "content" | "menus" | "locations" | "posts")
          : "site";
      const result = await publishTranslationDrafts(
        db,
        orgId,
        siteId,
        locale,
        scope,
        userId,
      );
      await upsertSiteLocale(db, orgId, siteId, {
        locale: result.target_locale,
        status: "published",
        fallback_enabled: true,
      });
      return result;
    }

    // ── Experiences ────────────────────────────────────────────────────────
    case "list_experiences": {
      const { listExperiences } = await import("~/server/utils/experiences");
      const experiences = await listExperiences(db, siteId);
      return { experiences };
    }

    case "create_experience": {
      const { createExperience } = await import("~/server/utils/experiences");
      const title = toSqlText(input.title);
      if (!title) return { error: "title is required" };
      const explicitLocationId = toSqlText(input.location_id);
      let locationId = explicitLocationId;
      if (explicitLocationId) {
        const location = await queryFirst(
          db,
          `
            SELECT 1 FROM business_locations
            WHERE id = ? AND organization_id = ? AND site_id = ?
            LIMIT 1
          `,
          [explicitLocationId, orgId, siteId],
        );
        if (!location) return { error: "Location not found or access denied" };
      } else {
        const verifiedCtxLocationId = ctx.locationId
          ? (await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?`, [ctx.locationId, orgId, siteId]))?.id
          : null;
        locationId = verifiedCtxLocationId
          ?? (await queryFirst<{ primary_location_id: string | null }>(db, `SELECT primary_location_id FROM sites WHERE id = ? AND organization_id = ?`, [siteId, orgId]))?.primary_location_id
          ?? (await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE site_id = ? AND organization_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`, [siteId, orgId]))?.id
          ?? null;
      }
      if (!locationId) return { error: "location_id is required" };
      let slots = Array.isArray(input.time_slots)
        ? input.time_slots.map(String)
        : null;
      let recurringSlots = asValidRecurringSlots(input.recurring_slots);
      const slotStart = typeof input.slot_start === 'string' ? input.slot_start : null;
      const slotEnd = typeof input.slot_end === 'string' ? input.slot_end : null;
      const slotIntervalMinutes = typeof input.slot_interval_minutes === 'number' ? input.slot_interval_minutes : null;
      const slotWeekday = typeof input.slot_weekday === 'string' && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(input.slot_weekday)
        ? input.slot_weekday
        : null;

      // Auto-generate slots from convenience parameters if provided
      if (slotStart && slotEnd && slotIntervalMinutes) {
        const { generateSlots } = await import("~/server/utils/experiences");
        const generatedSlots = generateSlots(slotStart, slotEnd, slotIntervalMinutes);
        if (slotWeekday) {
          // Assign to recurring_slots for the specific weekday
          recurringSlots = recurringSlots || {};
          recurringSlots[slotWeekday as keyof RecurringSlots] = generatedSlots;
        } else {
          // Assign to flat time_slots
          slots = generatedSlots;
        }
      }
      const images = Array.isArray(input.images)
        ? input.images.map((img: { url?: ApiValue; kind?: ApiValue }) => ({
            url: toSqlText(img.url) ?? "",
            kind: img.kind === "video" ? "video" : "image",
          }))
        : undefined;
      const experience = await createExperience(
        db,
        orgId,
        siteId,
        {
          title,
          tagline: toSqlText(input.tagline) ?? null,
          body: toSqlText(input.body) ?? null,
          price: toSqlText(input.price) ?? null,
          price_amount: typeof input.price_amount === "number" ? input.price_amount : null,
          compare_at_price_amount: typeof input.compare_at_price_amount === "number" ? input.compare_at_price_amount : null,
          sale_starts_at: toSqlText(input.sale_starts_at) ?? null,
          sale_ends_at: toSqlText(input.sale_ends_at) ?? null,
          duration_minutes:
            typeof input.duration_minutes === "number"
              ? Math.round(input.duration_minutes)
              : null,
          max_capacity:
            typeof input.max_capacity === "number"
              ? Math.round(input.max_capacity)
              : null,
          time_slots: slots,
          recurring_slots: recurringSlots,
          available_note: toSqlText(input.available_note) ?? null,
          image_asset_id: toSqlText(input.image_asset_id) ?? null,
          video_asset_id: toSqlText(input.video_asset_id) ?? null,
          images,
          location_id: locationId,
          status: (["active", "inactive", "sold_out"].includes(
            String(input.status ?? ""),
          )
            ? String(input.status)
            : "active") as "active" | "inactive" | "sold_out",
          sort_order:
            typeof input.sort_order === "number"
              ? Math.round(input.sort_order)
              : 0,
          featured:
            typeof input.featured === "boolean" ? input.featured : false,
          featured_sort_order:
            typeof input.featured_sort_order === "number"
              ? Math.round(input.featured_sort_order)
              : 0,
          seo_title: toSqlText(input.seo_title) ?? null,
          seo_description: toSqlText(input.seo_description) ?? null,
        },
        userId,
      );
      return {
        experience_id: experience.id,
        slug: experience.slug,
        title: experience.title,
      };
    }

    case "update_experience": {
      const { updateExperience, getExperienceById } = await import("~/server/utils/experiences");
      const id = toSqlText(input.experience_id);
      if (!id) return { error: "experience_id is required" };
      const updates: Record<string, ApiValue> = {};
      if (input.title !== undefined) updates.title = toSqlText(input.title);
      if (input.tagline !== undefined)
        updates.tagline = toSqlText(input.tagline) ?? null;
      if (input.body !== undefined)
        updates.body = toSqlText(input.body) ?? null;
      if (input.price !== undefined)
        updates.price = toSqlText(input.price) ?? null;
      if (input.price_amount !== undefined) {
        if (input.price_amount !== null && typeof input.price_amount !== "number") {
          return { error: "price_amount must be a number or null" };
        }
        updates.price_amount = typeof input.price_amount === "number" ? input.price_amount : null;
      }
      if (input.compare_at_price_amount !== undefined) {
        if (input.compare_at_price_amount !== null && typeof input.compare_at_price_amount !== "number") {
          return { error: "compare_at_price_amount must be a number or null" };
        }
        updates.compare_at_price_amount = typeof input.compare_at_price_amount === "number" ? input.compare_at_price_amount : null;
      }
      if (input.sale_starts_at !== undefined)
        updates.sale_starts_at = toSqlText(input.sale_starts_at) ?? null;
      if (input.sale_ends_at !== undefined)
        updates.sale_ends_at = toSqlText(input.sale_ends_at) ?? null;
      if (input.duration_minutes !== undefined)
        updates.duration_minutes =
          typeof input.duration_minutes === "number"
            ? Math.round(input.duration_minutes)
            : null;
      if (input.max_capacity !== undefined)
        updates.max_capacity =
          typeof input.max_capacity === "number"
            ? Math.round(input.max_capacity)
            : null;
      if (input.time_slots !== undefined)
        updates.time_slots = Array.isArray(input.time_slots)
          ? input.time_slots.map(String)
          : null;
      if (input.recurring_slots !== undefined)
        updates.recurring_slots = asValidRecurringSlots(input.recurring_slots);

      // Handle convenience slot generation parameters
      const slotStart = typeof input.slot_start === 'string' ? input.slot_start : null;
      const slotEnd = typeof input.slot_end === 'string' ? input.slot_end : null;
      const slotIntervalMinutes = typeof input.slot_interval_minutes === 'number' ? input.slot_interval_minutes : null;
      const slotWeekday = typeof input.slot_weekday === 'string' && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(input.slot_weekday)
        ? input.slot_weekday
        : null;

      if (slotStart && slotEnd && slotIntervalMinutes) {
        const { generateSlots } = await import("~/server/utils/experiences");
        const generatedSlots = generateSlots(slotStart, slotEnd, slotIntervalMinutes);
        if (slotWeekday) {
          // Assign to recurring_slots for the specific weekday while preserving
          // recurring slots for other weekdays.
          const existingExperience = await getExperienceById(db, siteId, id);
          const existingRecurring = existingExperience?.recurring_slots && typeof existingExperience.recurring_slots === 'object'
            ? existingExperience.recurring_slots as Record<string, unknown>
            : {};
          const incomingRecurring = updates.recurring_slots && typeof updates.recurring_slots === 'object'
            ? updates.recurring_slots as Record<string, unknown>
            : (input.recurring_slots && typeof input.recurring_slots === 'object'
                ? input.recurring_slots as Record<string, unknown>
                : {});
          updates.recurring_slots = {
            ...existingRecurring,
            ...incomingRecurring,
            [slotWeekday]: generatedSlots,
          };
        } else {
          // Assign to flat time_slots and clear recurring slots so the new
          // flat schedule is the source of truth.
          updates.time_slots = generatedSlots;
          updates.recurring_slots = null;
        }
      }

      // If flat time_slots are explicitly set without a weekday update, clear
      // recurring slots to avoid schedule conflicts.
      if (!slotWeekday && updates.time_slots !== undefined && input.recurring_slots === undefined) {
        updates.recurring_slots = null;
      }

      if (input.available_note !== undefined)
        updates.available_note = toSqlText(input.available_note) ?? null;
      if (input.image_asset_id !== undefined)
        updates.image_asset_id = toSqlText(input.image_asset_id) ?? null;
      if (input.video_asset_id !== undefined)
        updates.video_asset_id = toSqlText(input.video_asset_id) ?? null;
      if (input.images !== undefined)
        updates.images = Array.isArray(input.images)
          ? input.images.map((img: { url?: ApiValue; kind?: ApiValue }) => ({
              url: toSqlText(img.url) ?? "",
              kind: img.kind === "video" ? "video" : "image",
            }))
          : null;
      if (input.location_id !== undefined)
        updates.location_id = toSqlText(input.location_id) ?? null;
      if (
        input.status !== undefined &&
        ["active", "inactive", "sold_out"].includes(String(input.status))
      )
        updates.status = String(input.status);
      if (input.sort_order !== undefined)
        updates.sort_order = Number(input.sort_order);
      if (input.featured !== undefined) {
        if (typeof input.featured !== "boolean")
          return { error: "featured must be a boolean" };
        updates.featured = input.featured;
      }
      if (input.featured_sort_order !== undefined) {
        const parsed = Number(input.featured_sort_order);
        if (!Number.isFinite(parsed))
          return { error: "featured_sort_order must be a number" };
        updates.featured_sort_order = parsed;
      }
      if (input.seo_title !== undefined)
        updates.seo_title = toSqlText(input.seo_title) ?? null;
      if (input.seo_description !== undefined)
        updates.seo_description = toSqlText(input.seo_description) ?? null;
      const updated = await updateExperience(
        db,
        siteId,
        id,
        updates as ApiValue,
      );
      if (!updated) return { error: "Experience not found" };
      return { updated: true, experience_id: updated.id, slug: updated.slug };
    }

    case "delete_experience": {
      const { deleteExperience } = await import("~/server/utils/experiences");
      const id = toSqlText(input.experience_id);
      if (!id) return { error: "experience_id is required" };
      const deleted = await deleteExperience(db, siteId, id, {
        locationId: toSqlText(input.location_id) ?? null,
      });
      if (!deleted) return { error: "Experience not found" };
      return { deleted: true };
    }

    case "list_experience_bookings": {
      const { listExperienceBookings } =
        await import("~/server/utils/experiences");
      const id = toSqlText(input.experience_id);
      if (!id) return { error: "experience_id is required" };
      const bookings = await listExperienceBookings(db, siteId, id, {
        locationId: toSqlText(input.location_id) ?? ctx.locationId ?? null,
      });
      return { bookings };
    }

    case "update_experience_booking": {
      const { updateBookingStatus } =
        await import("~/server/utils/experiences");
      const expId = toSqlText(input.experience_id);
      const bookingId = toSqlText(input.booking_id);
      const status = toSqlText(input.status);
      if (!expId || !bookingId || !status)
        return { error: "experience_id, booking_id, and status are required" };
      if (!["confirmed", "cancelled"].includes(status))
        return { error: "status must be confirmed or cancelled" };
      const ok = await updateBookingStatus(
        db,
        siteId,
        expId,
        bookingId,
        status as "confirmed" | "cancelled",
      );
      if (!ok) return { error: "Booking not found" };
      return { updated: true };
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

    case "create_work_request": {
      const type = toSqlText(input.type);
      let title = toSqlText(input.title);
      const description = toSqlText(input.description) ?? null;
      const priority = toSqlText(input.priority) ?? "normal";

      const validTypes = [
        "content_update",
        "menu_update",
        "translation",
        "seo",
        "google_business",
        "seasonal",
        "photo_update",
        "social_media",
        "technical",
        "other",
      ];
      const validPriorities = ["low", "normal", "high", "urgent"];

      if (!type || !validTypes.includes(type))
        return { error: `type must be one of: ${validTypes.join(", ")}` };
      title = title?.trim();
      if (!title) return { error: "title is required" };
      if (title.length > 120)
        return { error: "title must be at most 120 characters" };
      if (!validPriorities.includes(priority))
        return { error: "priority must be low, normal, high, or urgent" };

      const result = await createWorkRequest(env, db, orgId, siteId, {
        type,
        title,
        description,
        priority,
        source: "chowbot",
      });
      if (result.status >= 400) return result.data;

      return {
        created: true,
        id: (result.data as { id: string }).id,
        message:
          "Work request submitted to the Paul & Julia queue. They'll take care of it.",
      };
    }

    case "list_work_requests": {
      const rows = await listWorkRequestsForOrganization(db, orgId);
      return { work_requests: rows };
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
      const postId = toSqlText(input.post_id);
      if (!postId) return { error: "post_id is required." };
      const post = await getPost(db, orgId, siteId, postId, env);
      if (!post) return { error: "Post not found." };
      return { post };
    }

    case "set_post_image": {
      const postId = toSqlText(input.post_id);
      const assetId = toSqlText(input.asset_id);
      if (!postId || !assetId) return { error: "post_id and asset_id required." };
      let result;
      try {
        result = await updatePost(db, orgId, siteId, postId, { image_asset_id: assetId }, userId, env);
      } catch (error) {
        if (error instanceof PostValidationError) return { error: error.message };
        throw error;
      }
      if (!result) return { error: "Failed to update post image." };
      return { updated: true, post_id: postId, asset_id: assetId };
    }

    case "list_blog_posts": {
      const status = typeof input.status === "string" ? input.status : undefined;
      const posts = await listPlatformBlogPosts(db, status, siteId);
      return { posts };
    }

    case "get_blog_post": {
      const postId = toSqlText(input.post_id);
      if (!postId) return { error: "post_id is required." };
      const post = await getPlatformBlogPost(db, postId, siteId);
      return { post };
    }

    case "create_blog_post": {
      const result = await createPlatformBlogPost(
        db,
        userId,
        {
          title: input.title,
          body: input.body,
          excerpt: input.excerpt,
          category: input.category,
          components: input.components,
          publish: input.publish,
        },
        { site_id: siteId, organization_id: orgId },
      );
      return { post: result.post };
    }

    case "update_blog_post": {
      const postId = toSqlText(input.post_id);
      if (!postId) return { error: "post_id is required." };
      const result = await updatePlatformBlogPost(
        db,
        postId,
        {
          title: input.title,
          body: input.body,
          excerpt: input.excerpt,
          category: input.category,
          components: input.components,
          publish: input.publish,
          unpublish: input.unpublish,
        },
        siteId,
      );
      return { post: result.post };
    }

    case "set_blog_post_image": {
      const postId = toSqlText(input.post_id);
      const assetId = toSqlText(input.asset_id);
      if (!postId || !assetId) return { error: "post_id and asset_id required." };
      const result = await updatePlatformBlogPost(db, postId, { featured_image_asset_id: assetId }, siteId);
      return { updated: true, post_id: postId, asset_id: assetId, post: result.post };
    }

    case "delete_blog_post": {
      const postId = toSqlText(input.post_id);
      if (!postId) return { error: "post_id is required." };
      await deletePlatformBlogPost(db, postId, siteId);
      return { post_id: postId, deleted: true };
    }

    case "list_menus": {
      const locationId = typeof input.location_id === "string" ? input.location_id.trim() : undefined;
      const menus = await getMenus(db, orgId, siteId, locationId || undefined);
      return { menus };
    }

    case "reorder_menu_items": {
      const menuId = toSqlText(input.menu_id);
      if (!menuId) return { error: "menu_id is required." };
      if (!Array.isArray(input.updates) || !input.updates.length)
        return { error: "updates array is required." };
      const updates = (input.updates as Array<{ id?: unknown; sort_order?: unknown }>).map((u) => ({
        id: String(u.id ?? ""),
        sort_order: Number(u.sort_order ?? 0),
      }));
      try {
        await reorderMenuItems(db, orgId, siteId, menuId, updates);
      } catch (error) {
        if (error instanceof MenuNotFoundError) return { error: error.message };
        throw error;
      }
      return { reordered: true, menu_id: menuId };
    }

    case "set_menu_item_image": {
      const itemId = toSqlText(input.menu_item_id);
      const assetId = toSqlText(input.asset_id);
      if (!itemId || !assetId) return { error: "menu_item_id and asset_id required." };
      const result = await updateMenuItem(db, orgId, siteId, itemId, { image_asset_id: assetId }, userId);
      if (!result) return { error: "Failed to update menu item image." };
      return { updated: true, menu_item_id: itemId, asset_id: assetId };
    }

    case "get_location": {
      const locationId = toSqlText(input.location_id);
      if (!locationId) return { error: "location_id is required." };
      const row = await queryFirst(
        db,
        `SELECT * FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        [locationId, orgId, siteId],
      );
      if (!row) return { error: "Location not found." };
      return { location: row };
    }

    case "set_location_hero_image": {
      const locationId = toSqlText(input.location_id);
      const assetId = toSqlText(input.asset_id);
      if (!locationId || !assetId) return { error: "location_id and asset_id required." };
      const result = await updateLocation(db, orgId, siteId, locationId, { hero_image_asset_id: assetId }, userId);
      if (!result || result.status >= 400) return { error: "Failed to set location hero image." };
      return { updated: true, location_id: locationId, asset_id: assetId };
    }

    case "set_location_hero_video": {
      const locationId = toSqlText(input.location_id);
      const assetId = toSqlText(input.asset_id);
      if (!locationId || !assetId) return { error: "location_id and asset_id required." };
      const result = await updateLocation(db, orgId, siteId, locationId, { hero_video_asset_id: assetId }, userId);
      if (!result || result.status >= 400) return { error: "Failed to set location hero video." };
      return { updated: true, location_id: locationId, asset_id: assetId };
    }

    case "get_site_settings": {
      const row = await queryFirst(
        db,
        `SELECT brand_name, brand_description, logo_url, logo_asset_id, default_currency,
                         contact_email, facebook_url, instagram_url, tiktok_url, footer_tagline,
                         press_email, partnerships_email, catering_email, careers_email
                  FROM sites WHERE id = ? AND organization_id = ? LIMIT 1`,
        [siteId, orgId],
      );
      if (!row) return { error: "Site not found." };
      return { settings: row };
    }

    case "set_logo": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      await updateSiteSettingsFields(db, env, siteId, orgId, { logo_asset_id: assetId }, userId);
      return { updated: true, logo_asset_id: assetId };
    }

    case "update_media_asset": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      const updates: Record<string, string> = {};
      if (typeof input.alt_text === "string") updates.alt_text = input.alt_text;
      if (typeof input.title === "string") updates.title = input.title;
      if (typeof input.caption === "string") updates.caption = input.caption;
      if (!Object.keys(updates).length) return { error: "Provide at least one field to update." };
      await updateMediaAssetMetadata(db, assetId, siteId, updates);
      return { updated: true, asset_id: assetId };
    }

    case "set_home_hero_image": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      const locationId = typeof input.location_id === "string" && input.location_id.trim()
        ? input.location_id.trim() : undefined;
      const result = await updateHomeHero(db, orgId, siteId, { image_asset_id: assetId, location_id: locationId });
      return { updated: true, ...result };
    }

    case "set_home_hero_video": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      const locationId = typeof input.location_id === "string" && input.location_id.trim()
        ? input.location_id.trim() : undefined;
      const result = await updateHomeHero(db, orgId, siteId, { video_asset_id: assetId, location_id: locationId });
      return { updated: true, ...result };
    }

    case "update_home_hero": {
      const locationId = typeof input.location_id === "string" && input.location_id.trim()
        ? input.location_id.trim() : undefined;
      const result = await updateHomeHero(db, orgId, siteId, {
        title: typeof input.title === "string" ? input.title : undefined,
        subtitle: typeof input.subtitle === "string" ? input.subtitle : undefined,
        image_asset_id: typeof input.image_asset_id === "string" ? input.image_asset_id : undefined,
        video_asset_id: typeof input.video_asset_id === "string" ? input.video_asset_id : undefined,
        location_id: locationId,
      });
      return { updated: true, ...result };
    }

    case "set_about_story_image": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      const id = `${orgId}::${siteId}::site::about::story.image`;
      const publicUrl = await resolveMediaAssetPublicUrl(db, env, siteId, assetId);
      await upsertSiteContent(db, {
        id,
        organization_id: orgId,
        site_id: siteId,
        location_id: undefined,
        page: "about",
        field: "story.image",
        value: publicUrl,
        type: "image",
        source: "manual",
        content: publicUrl,
        hero_title: undefined,
        hero_subtitle: undefined,
        hero_image_asset_id: undefined,
        hero_video_asset_id: undefined,
        component: "SayaBrandStory",
      });
      return { updated: true, asset_id: assetId, public_url: publicUrl };
    }

    case "set_home_story_image": {
      const assetId = toSqlText(input.asset_id);
      if (!assetId) return { error: "asset_id is required." };
      const id = `${orgId}::${siteId}::site::home::story.image`;
      const publicUrl = await resolveMediaAssetPublicUrl(db, env, siteId, assetId);
      await upsertSiteContent(db, {
        id,
        organization_id: orgId,
        site_id: siteId,
        location_id: undefined,
        page: "home",
        field: "story.image",
        value: publicUrl,
        type: "image",
        source: "manual",
        content: publicUrl,
        hero_title: undefined,
        hero_subtitle: undefined,
        hero_image_asset_id: undefined,
        hero_video_asset_id: undefined,
        component: "SayaBrandStory",
      });
      return { updated: true, asset_id: assetId, public_url: publicUrl };
    }

    case "get_notification_settings": {
      const settings = await getNotificationsSettings(db, orgId, siteId);
      return { settings };
    }

    case "update_notification_settings": {
      const phone = typeof input.whatsapp_phone === "string" && input.whatsapp_phone.trim()
        ? input.whatsapp_phone.trim()
        : undefined;
      const channels = Array.isArray(input.channels)
        ? input.channels.filter((value: unknown): value is string => value === "email" || value === "whatsapp")
        : undefined;
      if (!phone && !channels) return { error: "whatsapp_phone and/or channels are required." };
      if (channels && channels.length === 0) return { error: "channels must contain at least one valid value (email or whatsapp)." };
      const result = await updateNotificationsSettings(db, orgId, siteId, phone, channels);
      return { updated: true, ...result };
    }

    case "update_location_qa": {
      const qaId = toSqlText(input.qa_id);
      const locationId = toSqlText(input.location_id);
      if (!qaId || !locationId) return { error: "qa_id and location_id required." };
      const updates: Record<string, unknown> = {};
      if (input.question !== undefined) updates.question = input.question;
      if (input.answer !== undefined) updates.answer = input.answer;
      if (input.status !== undefined) updates.status = input.status;
      if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
      return await updateLocationQa(db, orgId, siteId, locationId, qaId, updates);
    }

    case "reorder_location_qa": {
      const locationId = toSqlText(input.location_id);
      if (!locationId) return { error: "location_id is required." };
      if (!Array.isArray(input.updates) || !input.updates.length)
        return { error: "updates array is required." };
      const updates = (input.updates as Array<{ id?: unknown; sort_order?: unknown }>).map((u) => ({
        id: String(u.id ?? ""),
        sort_order: Number(u.sort_order ?? 0),
      }));
      return await reorderLocationQa(db, orgId, siteId, locationId, updates);
    }

    case "get_experience": {
      const experienceId = toSqlText(input.experience_id);
      if (!experienceId) return { error: "experience_id is required." };
      const experience = await getExperienceById(db, siteId, experienceId);
      if (!experience) return { error: "Experience not found." };
      return { experience };
    }

    case "set_experience_image": {
      const experienceId = toSqlText(input.experience_id);
      const assetId = toSqlText(input.asset_id);
      if (!experienceId || !assetId) return { error: "experience_id and asset_id required." };
      const updated = await updateExperience(db, siteId, experienceId, { image_asset_id: assetId });
      if (!updated) return { error: "Failed to set experience image." };
      return { updated: true, experience_id: experienceId, asset_id: assetId };
    }

    case "set_experience_video": {
      const experienceId = toSqlText(input.experience_id);
      const assetId = toSqlText(input.asset_id);
      if (!experienceId || !assetId) return { error: "experience_id and asset_id required." };
      const updated = await updateExperience(db, siteId, experienceId, { video_asset_id: assetId });
      if (!updated) return { error: "Failed to set experience video." };
      return { updated: true, experience_id: experienceId, asset_id: assetId };
    }

    case "get_translation_review_items": {
      const locale = toSqlText(input.locale);
      if (!locale) return { error: "locale is required." };
      const scope = (toSqlText(input.scope) ?? undefined) as "site" | "content" | "menus" | "locations" | "posts" | undefined;
      const status = (toSqlText(input.status) ?? undefined) as "missing" | "draft" | "published" | "stale" | "all" | undefined;
      const result = await listTranslationReviewItems(db, orgId, siteId, { targetLocale: locale, scope, status });
      return result;
    }

    case "save_translation_review_item": {
      const locale = toSqlText(input.locale);
      const entityType = toSqlText(input.entity_type) as "site_content" | "menu" | "menu_item" | "business_location" | "post" | null;
      const entityId = toSqlText(input.entity_id);
      const field = toSqlText(input.field);
      const fields = input.fields as Record<string, string> | null;
      if (!locale || !entityType || !entityId || !field || !fields)
        return { error: "locale, entity_type, entity_id, field, and fields are required." };
      const result = await saveTranslationReviewItem(db, orgId, siteId, {
        targetLocale: locale,
        entityType,
        entityId,
        field,
        fields,
      });
      return { updated: true, ...result };
    }

    case "get_dashboard_link": {
      const destination = toSqlText(input.destination) as DashboardDestination | null;
      if (!destination || !Object.prototype.hasOwnProperty.call(DASHBOARD_DESTINATIONS, destination)) {
        return {
          error: `destination is required and must be one of: ${Object.keys(DASHBOARD_DESTINATIONS).join(", ")}`,
        };
      }
      const org = await queryFirst<{ slug: string | null }>(
        db,
        `SELECT slug FROM organization WHERE id = ?`,
        [orgId],
      );
      return {
        url: buildDashboardUrl(
          { env, organizationId: orgId, organizationSlug: org?.slug ?? undefined },
          destination,
        ),
      };
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

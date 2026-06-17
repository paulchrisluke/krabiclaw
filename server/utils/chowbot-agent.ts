import {
  callAiGateway,
  type AiTool,
  type AiMessage,
} from "~/server/utils/ai-gateway";
import { hasCredits, chargeCredits } from "~/server/utils/ai-credits";
import {
  listPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
} from "~/server/utils/post-management";
import {
  getMenus,
  getMenuWithItems,
  createMenu,
  updateMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  deleteMenu,
  renameMenuSection,
  deleteMenuSection,
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
import { contentRegistry, getFieldDef } from "~/config/content-registry";
import { SUPPORTED_CURRENCIES } from "~/shared/currencies";
import type { MenuItem, UpdateMenuItemRequest } from "~/server/types/menu";

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
  const draftRow = locationId
    ? await db
        .prepare(
          `SELECT id, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, updated_at
         FROM site_content_drafts
         WHERE organization_id = ? AND site_id = ? AND page = ? AND field = 'hero' AND location_id = ?
         LIMIT 1`,
        )
        .bind(orgId, siteId, page, locationId)
        .first<Record<string, unknown>>()
    : await db
        .prepare(
          `SELECT id, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, updated_at
         FROM site_content_drafts
         WHERE organization_id = ? AND site_id = ? AND page = ? AND field = 'hero' AND location_id IS NULL
         LIMIT 1`,
        )
        .bind(orgId, siteId, page)
        .first<Record<string, unknown>>();

  const base = draftRow ?? liveRow ?? null;
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
    "story.title": "SayaBrandStory",
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
    component: "SayaHero",
  };

  await upsertSiteContent(db, payload);
}

async function getDraftContent(
  _db: D1Database,
  _organizationId: string,
  _siteId: string,
  _page: string,
  _locationId?: string,
): Promise<never[]> {
  return [];
}

async function upsertDraftContent(
  db: D1Database,
  payload: Parameters<typeof upsertSiteContent>[1],
) {
  await upsertSiteContent(db, payload);
}

async function publishDrafts(
  _db: D1Database,
  _organizationId: string,
  _siteId: string,
  _page: string,
  _locationId?: string,
): Promise<void> {
  // Site content is now written directly to canonical rows.
}

async function discardDrafts(
  _db: D1Database,
  _organizationId: string,
  _siteId: string,
  _page: string,
  _locationId?: string,
): Promise<void> {
  // Site content is now written directly to canonical rows.
}

async function deleteDraftContentField(
  db: D1Database,
  organizationId: string,
  siteId: string,
  page: string,
  field: string,
  locationId?: string,
) {
  await deleteSiteContentField(
    db,
    organizationId,
    siteId,
    page,
    field,
    locationId,
  );
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

const TOOLS: AiTool[] = [
  // ── Posts ──────────────────────────────────────────────────────────────────
  {
    name: "get_posts",
    description:
      "List posts for this site. Optionally filter by status or location.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "published", "archived"],
          description: "Filter by status. Omit to get all.",
        },
        location_id: {
          type: "string",
          description: "Filter to posts for a specific location.",
        },
      },
    },
  },
  {
    name: "create_post",
    description:
      "Create a new draft post. Saved as draft — NOT published until publish_post is called.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short headline (max 80 chars). Optional.",
        },
        body: {
          type: "string",
          description: "Post body (max 400 chars). Friendly, warm tone.",
        },
        image_asset_id: {
          type: "string",
          description:
            "Optional media asset ID from generate_image, get_location_media, or pending WhatsApp media.",
        },
        location_id: {
          type: "string",
          description:
            "Pin this post to a specific location. Omit for site-wide.",
        },
        post_type: {
          type: "string",
          enum: ["standard", "offer", "event", "update"],
          description: "Post type. Default: standard.",
        },
        cta_type: {
          type: "string",
          enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
          description: "Call-to-action button type.",
        },
        cta_url: { type: "string", description: "URL for the CTA button." },
        event_title: {
          type: "string",
          description: "Event name (for post_type: event).",
        },
        event_start: {
          type: "string",
          description: "Event start datetime ISO string.",
        },
        event_end: {
          type: "string",
          description: "Event end datetime ISO string.",
        },
        offer_coupon: {
          type: "string",
          description: "Coupon code (for post_type: offer).",
        },
        offer_terms: {
          type: "string",
          description: "Offer terms and conditions.",
        },
      },
      required: ["body"],
    },
  },
  {
    name: "publish_post",
    description:
      "Publish a draft post to the website. Only call after confirming content with the user.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to publish." },
      },
      required: ["post_id"],
    },
  },
  {
    name: "update_post",
    description:
      "Update a draft or published post — title, body, image, location, type, CTA, or event/offer fields. Does not change publish status.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to update." },
        title: {
          type: "string",
          description: "New headline (max 80 chars). Omit to leave unchanged.",
        },
        body: {
          type: "string",
          description:
            "New post body (max 400 chars). Omit to leave unchanged.",
        },
        image_asset_id: {
          type: "string",
          description: "New media asset ID. Omit to leave unchanged.",
        },
        location_id: {
          type: "string",
          description: "Reassign to a location. Omit to leave unchanged.",
        },
        post_type: {
          type: "string",
          enum: ["standard", "offer", "event", "update"],
        },
        cta_type: {
          type: "string",
          enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
        },
        cta_url: { type: "string" },
        event_title: { type: "string" },
        event_start: { type: "string", description: "ISO datetime string." },
        event_end: { type: "string", description: "ISO datetime string." },
        offer_coupon: { type: "string" },
        offer_terms: { type: "string" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "delete_post",
    description: "Permanently delete a post. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to delete." },
      },
      required: ["post_id"],
    },
  },

  // ── Menus ──────────────────────────────────────────────────────────────────
  {
    name: "get_menu",
    description: "Get a menu with all its sections and items.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: {
          type: "string",
          description:
            "Specific menu ID. Omit to get the first available menu.",
        },
      },
    },
  },
  {
    name: "create_menu",
    description: "Create a new menu.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Menu name." },
        description: { type: "string", description: "Optional description." },
        location_id: {
          type: "string",
          description: "Link to a specific location.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "rename_menu",
    description: "Rename an existing menu.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "ID of the menu." },
        name: { type: "string", description: "New name." },
        description: {
          type: "string",
          description: "Optional new description.",
        },
      },
      required: ["menu_id", "name"],
    },
  },
  {
    name: "rename_menu_section",
    description:
      "Rename a menu category/section, such as Appetizers, Drinks, Mains, or Desserts. Updates all items in that section.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "ID of the menu." },
        old_section: {
          type: "string",
          description: "Current section/category title.",
        },
        new_section: {
          type: "string",
          description: "New section/category title.",
        },
      },
      required: ["menu_id", "old_section", "new_section"],
    },
  },
  {
    name: "delete_menu_section",
    description:
      "Permanently delete a menu category/section and every item in it. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "ID of the menu." },
        section: {
          type: "string",
          description: "Section/category title to delete.",
        },
      },
      required: ["menu_id", "section"],
    },
  },
  {
    name: "add_menu_items_batch",
    description:
      "Add multiple brand-new menu items in one call. Do not use for edits, replacements, renamed items, revised prices, or existing menu content. Up to 100 items.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "Menu to add items to." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section: {
                type: "string",
                description: "Section/category name.",
              },
              name: { type: "string", description: "Dish name." },
              description: {
                type: "string",
                description: "Short description. Optional.",
              },
              price_amount: {
                type: "string",
                description:
                  'Numeric price amount only, without currency, e.g. "120". Optional.',
              },
              image_asset_id: {
                type: "string",
                description:
                  "Media asset ID from generate_image or pending WhatsApp media. Optional.",
              },
              allergens: {
                type: "array",
                items: { type: "string" },
                description: 'List of allergens, e.g. ["dairy", "nuts"].',
              },
              ingredients: {
                type: "array",
                items: { type: "string" },
                description: "Key ingredients.",
              },
              dietary_notes: {
                type: "array",
                items: { type: "string" },
                description:
                  'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].',
              },
              preparation: {
                type: "string",
                description: "How the dish is prepared.",
              },
              serving_note: {
                type: "string",
                description: "Notes about serving size or accompaniment.",
              },
            },
            required: ["section", "name"],
          },
        },
      },
      required: ["menu_id", "items"],
    },
  },
  {
    name: "sync_menu_items",
    description:
      "Reconcile a menu item list with an existing menu. Use this for menu updates, replacements, revised prices/descriptions, renamed items, or mixed create/update work.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "Menu to update." },
        items: {
          type: "array",
          description:
            "Items to reconcile. Existing items match by item_id first, then by normalized name/slug.",
          items: {
            type: "object",
            properties: {
              item_id: {
                type: "string",
                description: "Existing menu item ID when known.",
              },
              section: {
                type: "string",
                description: "Section/category name.",
              },
              name: { type: "string", description: "Dish name." },
              description: {
                type: "string",
                description: "Short description. Optional.",
              },
              price_amount: {
                type: "string",
                description:
                  'Numeric price amount only, without currency, e.g. "120". Optional.',
              },
              image_asset_id: {
                type: "string",
                description: "Media asset ID from generate_image. Optional.",
              },
              available: {
                type: "boolean",
                description: "Whether the item should be shown as available.",
              },
              allergens: {
                type: "array",
                items: { type: "string" },
                description: "List of allergens.",
              },
              ingredients: {
                type: "array",
                items: { type: "string" },
                description: "Key ingredients.",
              },
              dietary_notes: {
                type: "array",
                items: { type: "string" },
                description:
                  'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].',
              },
              preparation: { type: "string" },
              serving_note: { type: "string" },
            },
          },
        },
        set_missing_unavailable: {
          type: "boolean",
          description:
            "Only true when the user explicitly asks to remove, replace, hide, or make omitted items unavailable.",
        },
      },
      required: ["menu_id", "items"],
    },
  },
  {
    name: "add_menu_item",
    description: "Add a single item to a menu.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "Menu to add to." },
        section: { type: "string", description: "Section/category." },
        name: { type: "string", description: "Dish name." },
        description: {
          type: "string",
          description: "Short description. Optional.",
        },
        price_amount: {
          type: "string",
          description: "Numeric price amount only, without currency. Optional.",
        },
        image_asset_id: {
          type: "string",
          description:
            "Media asset ID from generate_image or pending WhatsApp media. Optional.",
        },
        allergens: { type: "array", items: { type: "string" } },
        ingredients: { type: "array", items: { type: "string" } },
        dietary_notes: { type: "array", items: { type: "string" } },
        preparation: { type: "string" },
        serving_note: { type: "string" },
      },
      required: ["menu_id", "section", "name"],
    },
  },
  {
    name: "update_menu_item",
    description:
      "Update a menu item — name, numeric price amount, description, image, availability, featured status, allergens, ingredients, dietary tags, preparation, or serving note.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "ID of the item." },
        section: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        price_amount: {
          type: "string",
          description: "Numeric price amount only, without currency.",
        },
        image_asset_id: {
          type: "string",
          description:
            "New media asset ID from generate_image or pending WhatsApp media.",
        },
        available: { type: "boolean" },
        featured: {
          type: "boolean",
          description:
            "Whether this item appears in the featured highlights on the home page.",
        },
        featured_sort_order: {
          type: "integer",
          description:
            "Order among featured items (lower = shown first). Only relevant when featured is true.",
        },
        allergens: { type: "array", items: { type: "string" } },
        ingredients: { type: "array", items: { type: "string" } },
        dietary_notes: { type: "array", items: { type: "string" } },
        preparation: { type: "string" },
        serving_note: { type: "string" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "delete_menu_item",
    description: "Permanently delete one menu item. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        menu_id: { type: "string", description: "Menu ID for verification." },
        item_id: { type: "string", description: "ID of the item." },
      },
      required: ["menu_id", "item_id"],
    },
  },
  {
    name: "publish_menu",
    description: "Publish a draft menu so it appears on the live site.",
    input_schema: {
      type: "object",
      properties: { menu_id: { type: "string" } },
      required: ["menu_id"],
    },
  },
  {
    name: "delete_menu",
    description:
      "Permanently delete a menu and all its items. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: { menu_id: { type: "string" } },
      required: ["menu_id"],
    },
  },

  // ── Locations ──────────────────────────────────────────────────────────────
  {
    name: "get_locations",
    description: "List all locations for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_location",
    description: "Create a new location/branch.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Location name." },
        city: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        email: { type: "string" },
        website_url: { type: "string" },
        maps_url: { type: "string" },
        google_place_id: { type: "string" },
        description: { type: "string", description: "About this location." },
        short_description: { type: "string", description: "One-line tagline." },
        opening_hours: {
          type: "string",
          description: "Opening hours, one line per day.",
        },
        rating: {
          type: "number",
          description: "Manual review rating from 0 to 5.",
        },
        review_count: {
          type: "integer",
          description: "Manual total review count.",
        },
        price_level: {
          type: "string",
          enum: [
            "FREE",
            "INEXPENSIVE",
            "MODERATE",
            "EXPENSIVE",
            "VERY_EXPENSIVE",
          ],
        },
        facebook_url: { type: "string" },
        instagram_url: { type: "string" },
        tiktok_url: { type: "string" },
        grab_url: {
          type: "string",
          description: "Grab Food ordering link for this location.",
        },
        uber_eats_url: {
          type: "string",
          description: "Uber Eats ordering link for this location.",
        },
        foodpanda_url: {
          type: "string",
          description: "FoodPanda ordering link for this location.",
        },
        hero_image_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero image — from generate_image, get_location_media, or pending WhatsApp media.",
        },
        hero_video_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero video — from get_location_media or pending WhatsApp media.",
        },
        is_primary: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_location",
    description: "Update a location. Updating title auto-syncs the URL slug.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "ID from get_locations." },
        title: {
          type: "string",
          description: "New name — also updates URL slug.",
        },
        city: { type: "string" },
        neighborhood: {
          type: "string",
          description:
            'Short neighbourhood tag shown on location hero and cards, e.g. "Beachside · 2 min from Centre Point".',
        },
        phone: { type: "string" },
        address: { type: "string" },
        email: { type: "string" },
        website_url: { type: "string" },
        maps_url: { type: "string" },
        google_place_id: { type: "string" },
        description: { type: "string", description: "About this location." },
        short_description: { type: "string", description: "One-line tagline." },
        opening_hours: {
          type: "string",
          description: "Opening hours, one line per day.",
        },
        rating: {
          type: "number",
          description: "Manual review rating from 0 to 5.",
        },
        review_count: {
          type: "integer",
          description: "Manual total review count.",
        },
        price_level: {
          type: "string",
          enum: [
            "FREE",
            "INEXPENSIVE",
            "MODERATE",
            "EXPENSIVE",
            "VERY_EXPENSIVE",
          ],
        },
        facebook_url: { type: "string" },
        instagram_url: { type: "string" },
        tiktok_url: { type: "string" },
        grab_url: {
          type: "string",
          description: "Grab Food ordering link for this location.",
        },
        uber_eats_url: {
          type: "string",
          description: "Uber Eats ordering link for this location.",
        },
        foodpanda_url: {
          type: "string",
          description: "FoodPanda ordering link for this location.",
        },
        hero_image_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero image — from generate_image, get_location_media, or pending WhatsApp media.",
        },
        hero_video_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero video — from get_location_media or pending WhatsApp media.",
        },
        is_primary: { type: "boolean" },
        status: { type: "string", enum: ["active", "inactive", "sync_error"] },
      },
      required: ["location_id"],
    },
  },
  {
    name: "delete_location",
    description:
      "Permanently delete a location/branch. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "ID from get_locations." },
      },
      required: ["location_id"],
    },
  },

  // ── Maps lookup ────────────────────────────────────────────────────────────
  {
    name: "lookup_maps_url",
    description:
      "Look up a Google Maps URL or share link to get location details — address, phone, coordinates, hours. Use when someone pastes a Google Maps link and wants to update their location details. After getting results, call update_location with the relevant fields.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Google Maps URL or share link (e.g. https://maps.app.goo.gl/... or https://www.google.com/maps/place/...)",
        },
      },
      required: ["url"],
    },
  },

  // ── Reviews ────────────────────────────────────────────────────────────────
  {
    name: "get_reviews",
    description:
      "Get reviews for a location, including aggregate score and star distribution.",
    input_schema: {
      type: "object",
      properties: {
        location_id: {
          type: "string",
          description: "Location ID from get_locations.",
        },
      },
      required: ["location_id"],
    },
  },
  {
    name: "reply_to_review",
    description: "Add or update the owner reply on a review.",
    input_schema: {
      type: "object",
      properties: {
        review_id: {
          type: "string",
          description: "Review ID from get_reviews.",
        },
        reply: { type: "string", description: "Owner reply text." },
      },
      required: ["review_id", "reply"],
    },
  },

  // ── Media ──────────────────────────────────────────────────────────────────
  {
    name: "get_location_media",
    description: "List media assets (images, videos) for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: {
          type: "string",
          description: "Location ID from get_locations.",
        },
        kind: {
          type: "string",
          enum: ["image", "video", "file"],
          description: "Filter by media type. Omit for all.",
        },
      },
      required: ["location_id"],
    },
  },
  {
    name: "delete_media_asset",
    description:
      "Delete a media asset from the library and Cloudflare storage. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: {
          type: "string",
          description: "ID from get_location_media.",
        },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "import_menu_from_pending_media",
    description:
      "Import menu items from the currently pending WhatsApp image or document. Use only when the user asks to import, extract, or read menu items from the pending file.",
    input_schema: {
      type: "object",
      properties: {
        menu_name: { type: "string", description: "Optional draft menu name." },
      },
    },
  },
  {
    name: "resolve_pending_media",
    description:
      "Clear the pending WhatsApp media state. Call with action=save_media after assigning the asset to any tool (menu item, hero, post, etc.) or when the user just wants it saved to the library. Call with action=cancel to discard.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save_media", "cancel"] },
      },
      required: ["action"],
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an AI image from a text prompt using the configured OpenAI image model. The image is automatically saved to the media library. Use for menu item photos, hero images, or social posts.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Describe the image. Include food type, style, plating, lighting. Be specific.",
        },
        location_id: {
          type: "string",
          description:
            "Optional: attach the generated image to a specific location.",
        },
      },
      required: ["prompt"],
    },
  },

  // ── Q&A ────────────────────────────────────────────────────────────────────
  {
    name: "get_location_qa",
    description: "Get Q&A pairs for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
      },
      required: ["location_id"],
    },
  },
  {
    name: "add_qa",
    description: "Add a Q&A pair to a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        question: { type: "string" },
        answer: {
          type: "string",
          description: "Owner answer. Optional — can be added later.",
        },
      },
      required: ["location_id", "question"],
    },
  },
  {
    name: "delete_qa",
    description: "Delete a Q&A entry. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        qa_id: { type: "string" },
        location_id: { type: "string" },
      },
      required: ["qa_id", "location_id"],
    },
  },

  // ── Submissions ────────────────────────────────────────────────────────────
  {
    name: "get_contact_submissions",
    description: "List contact form submissions for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_reservation_submissions",
    description: "List reservation requests for this site.",
    input_schema: { type: "object", properties: {} },
  },

  // ── Site Content ──────────────────────────────────────────────────────────
  {
    name: "get_site_content_page",
    description:
      "Read the current live and draft content for a tenant site page.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to inspect.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "save_site_content_field",
    description: "Save a draft value for a site page field.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to update.",
        },
        field: {
          type: "string",
          description: "Field key from the content registry.",
        },
        value: { type: "string", description: "New field value." },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page", "field", "value"],
    },
  },
  {
    name: "publish_site_content_page",
    description: "Publish all draft content for a site page.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to publish.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "discard_site_content_page",
    description: "Discard all draft content for a site page.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to reset.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "delete_site_content_field",
    description:
      "Delete a site page field from live content and drafts. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page that owns the field.",
        },
        field: {
          type: "string",
          description: "Field key from the content registry.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page", "field"],
    },
  },

  // ── Site ───────────────────────────────────────────────────────────────────
  {
    name: "get_site_stats",
    description:
      "Summary of site content: posts, menus, menu items, locations, reviews.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "rename_site",
    description: "Update the brand name and subdomain/URL slug of the site.",
    input_schema: {
      type: "object",
      properties: {
        brand_name: { type: "string", description: "New brand name." },
      },
      required: ["brand_name"],
    },
  },
  {
    name: "set_default_currency",
    description: "Set the default menu currency for this site.",
    input_schema: {
      type: "object",
      properties: {
        currency: { type: "string", enum: [...SUPPORTED_CURRENCIES] },
      },
      required: ["currency"],
    },
  },
  {
    name: "save_brand_description",
    description:
      "Save a one-line brand description for the site homepage and SEO.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "One-line brand description.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "update_site_social",
    description:
      "Set site-wide social media links, footer tagline, and brand contact emails. Pass only the fields to change; omit the rest.",
    input_schema: {
      type: "object",
      properties: {
        facebook_url: {
          type: "string",
          description: "Full Facebook page URL. Empty string to clear.",
        },
        instagram_url: {
          type: "string",
          description: "Full Instagram profile URL. Empty string to clear.",
        },
        tiktok_url: {
          type: "string",
          description: "Full TikTok profile URL. Empty string to clear.",
        },
        footer_tagline: {
          type: "string",
          description:
            "Short tagline shown in the site footer. Empty string to clear.",
        },
        press_email: {
          type: "string",
          description:
            "Email for press inquiries. Shown on brand contact page. Empty string to clear.",
        },
        partnerships_email: {
          type: "string",
          description:
            "Email for partnership inquiries. Empty string to clear.",
        },
        catering_email: {
          type: "string",
          description:
            "Email for catering and events inquiries. Empty string to clear.",
        },
        careers_email: {
          type: "string",
          description:
            "Email for careers/job inquiries. Empty string to clear.",
        },
      },
    },
  },
  {
    name: "list_site_languages",
    description:
      "List the source language and enabled translation languages for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "save_site_language",
    description:
      "Create or update a site language. Use this for source language, draft/published/disabled status, display label, and source fallback.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "BCP-47 locale code, such as en, th, fr, ja, or zh-CN.",
        },
        label: {
          type: "string",
          description: "Optional display label shown in dashboard controls.",
        },
        status: {
          type: "string",
          enum: ["draft", "published", "disabled"],
          description: "Public availability for this locale.",
        },
        fallback_enabled: {
          type: "boolean",
          description:
            "Whether missing translated content falls back to the source language.",
        },
        is_source: {
          type: "boolean",
          description: "Set true to make this locale the source language.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "delete_site_language",
    description:
      "Remove a non-source site language. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        locale: { type: "string", description: "Locale code to remove." },
      },
      required: ["locale"],
    },
  },
  {
    name: "estimate_site_translation",
    description:
      "Estimate translation scope and AI credits before translating a site language. Use before starting translation work.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which part of the site to estimate.",
        },
        include_published: {
          type: "boolean",
          description:
            "Include already published translations in the estimate.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "start_site_translation_job",
    description:
      "Create a queued translation job after the user approves the estimate. This queues work but does not translate immediately.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which part of the site to translate.",
        },
        include_published: {
          type: "boolean",
          description: "Include already published translations.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "list_translation_jobs",
    description: "List recent translation jobs for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_translation_job",
    description: "Inspect a translation job and its queued items.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "run_translation_job_batch",
    description:
      "Run one batch of an approved queued translation job. This calls AI, charges credits, and saves draft translations. Confirm before using.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "publish_site_translations",
    description:
      "Publish matching draft translations for a locale and scope so they become visible on the public site. Confirm before using.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which translated drafts to publish.",
        },
      },
      required: ["locale"],
    },
  },
  // ── Experiences ───────────────────────────────────────────────────────────
  {
    name: "list_experiences",
    description: "List all experiences for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_experience",
    description: "Create a new bookable dining experience for this site.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: 'Experience name, e.g. "Teppanyaki Night".',
        },
        tagline: {
          type: "string",
          description: "One-line hook shown on the listing card.",
        },
        body: {
          type: "string",
          description:
            "Rich HTML body — full description, what's included, atmosphere, etc.",
        },
        price: {
          type: "string",
          description: 'Price string, e.g. "THB 1,500 / person".',
        },
        featured: {
          type: "boolean",
          description:
            "Whether to feature this experience on the homepage/location pages (when no menu exists).",
        },
        featured_sort_order: {
          type: "number",
          description:
            "Sort order for featured experiences (lower numbers appear first).",
        },
        duration_minutes: {
          type: "number",
          description: "Duration in minutes, e.g. 90.",
        },
        max_capacity: {
          type: "number",
          description: "Maximum guests per booking.",
        },
        time_slots: {
          type: "array",
          items: { type: "string" },
          description: 'Available time slots, e.g. ["17:00","19:00","21:00"].',
        },
        available_note: {
          type: "string",
          description:
            'Human-readable availability, e.g. "Every Friday & Saturday".',
        },
        image_asset_id: {
          type: "string",
          description: "Media asset ID for hero image.",
        },
        location_id: {
          type: "string",
          description: "Pin to a specific location ID. Omit for site-wide.",
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "sold_out"],
          description: "Default: active.",
        },
        seo_title: { type: "string", description: "SEO page title override." },
        seo_description: {
          type: "string",
          description: "SEO meta description (150–160 chars).",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_experience",
    description: "Update an existing experience — any combination of fields.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: {
          type: "string",
          description: "ID of the experience to update.",
        },
        title: { type: "string" },
        tagline: { type: "string" },
        body: { type: "string" },
        featured: {
          type: "boolean",
          description:
            "Whether to feature this experience on the homepage/location pages (when no menu exists).",
        },
        featured_sort_order: {
          type: "number",
          description:
            "Sort order for featured experiences (lower numbers appear first).",
        },
        price: { type: "string" },
        duration_minutes: { type: "number" },
        max_capacity: { type: "number" },
        time_slots: { type: "array", items: { type: "string" } },
        available_note: { type: "string" },
        image_asset_id: { type: "string" },
        location_id: { type: "string" },
        status: { type: "string", enum: ["active", "inactive", "sold_out"] },
        sort_order: { type: "number" },
        seo_title: { type: "string" },
        seo_description: { type: "string" },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "delete_experience",
    description:
      "Permanently delete an experience and all its bookings. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: {
          type: "string",
          description: "ID of the experience to delete.",
        },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "list_experience_bookings",
    description: "List booking requests for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string", description: "Experience ID." },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "update_experience_booking_status",
    description: "Confirm or cancel a guest booking for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        booking_id: { type: "string" },
        status: { type: "string", enum: ["confirmed", "cancelled"] },
      },
      required: ["experience_id", "booking_id", "status"],
    },
  },
  // ── Managed service work requests ─────────────────────────────────────────
  {
    name: "create_work_request",
    description:
      "Submit a work request to the Paul & Julia managed service queue. Use this when the owner needs something done that requires human attention — content updates, translations, photo work, SEO, Google Business management, seasonal campaigns, or anything beyond automated tools. Always confirm the details with the owner before submitting.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
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
          ],
          description: "Category of work needed.",
        },
        title: {
          type: "string",
          description:
            "Short summary of what needs to be done (max 120 chars).",
        },
        description: {
          type: "string",
          description:
            "Full details — what, where, any specific requirements or context.",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description:
            "How urgent. Default: normal. Only use high/urgent if the owner specifically says so.",
        },
      },
      required: ["type", "title"],
    },
  },
];

const CONFIRM_REQUIRED = new Set([
  "publish_post",
  "delete_post",
  "publish_menu",
  "delete_menu",
  "delete_menu_item",
  "delete_menu_section",
  "delete_location",
  "delete_media_asset",
  "delete_qa",
  "delete_site_content_field",
  "delete_site_language",
  "start_site_translation_job",
  "run_translation_job_batch",
  "publish_site_translations",
  "delete_experience",
]);

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
  if (!CONFIRM_REQUIRED.has(name)) return false;
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

  if (requiresConfirmation(name, ctx.agentMessages ?? [])) {
    return {
      __requires_confirmation: true,
      message: `Please confirm you want to ${name.replace(/_/g, " ")}.`,
    };
  }

  switch (name) {
    case "get_posts": {
      const posts = await listPosts(db, orgId, siteId, input.status);
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
      const post = await createPost(
        db,
        orgId,
        siteId,
        {
          title: input.title,
          body: input.body,
          image_asset_id: input.image_asset_id,
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
      );
      return {
        id: post.id,
        title: post.title,
        body: post.body,
        status: post.status,
        post_type: post.post_type,
      };
    }

    case "publish_post": {
      const result = await publishPost(db, orgId, siteId, input.post_id, [
        "site",
      ]);
      if (!result) return { error: "Post not found or already published." };
      return {
        id: result.id,
        title: result.title,
        status: result.status,
        published_at: result.published_at,
      };
    }

    case "update_post": {
      const post = await updatePost(
        db,
        orgId,
        siteId,
        input.post_id,
        {
          title: input.title,
          body: input.body,
          image_asset_id: input.image_asset_id,
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
      );
      if (!post) return { error: "Post not found." };
      return {
        id: post.id,
        title: post.title,
        body: post.body,
        status: post.status,
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
        const location = await db
          .prepare(
            `
          SELECT 1 FROM business_locations
          WHERE id = ? AND organization_id = ? AND site_id = ?
          LIMIT 1
        `,
          )
          .bind(effectiveLocationId, orgId, siteId)
          .first();
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

    case "rename_menu": {
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

      const updated = await renameMenuSection(
        db,
        menuId,
        oldSection,
        newSection,
        userId,
      );
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

      const deleted = await deleteMenuSection(db, menuId, section);
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
            menuId,
            {
              section,
              name,
              description: getToolString(itemRecord, "description", 500),
              price_amount: getToolString(itemRecord, "price_amount", 50),
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
            menuId,
            {
              section,
              name,
              description: getToolString(itemRecord, "description", 500),
              price_amount: getToolString(itemRecord, "price_amount", 50),
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

    case "add_menu_item": {
      const item = await createMenuItem(
        db,
        input.menu_id,
        {
          section: input.section,
          name: input.name,
          description: input.description,
          price_amount: input.price_amount,
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
      const item = await updateMenuItem(db, input.item_id, updates, userId);
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

    case "get_locations": {
      const rows = await db
        .prepare(
          `SELECT id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_place_id,
                rating, review_count, description, short_description, price_level,
                instagram_url, facebook_url, tiktok_url, hero_image_asset_id, hero_video_asset_id,
                status, is_primary
         FROM business_locations WHERE organization_id = ? AND site_id = ? ORDER BY is_primary DESC, title ASC`,
        )
        .bind(orgId, siteId)
        .all();
      return rows.results ?? [];
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
          phone: toSqlText(input.phone) ?? undefined,
          email: toSqlText(input.email) ?? undefined,
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

    case "lookup_maps_url": {
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
        const probe = await fetch(parsedRawUrl.toString(), {
          method: "HEAD",
          redirect: "manual",
        });
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

    case "get_reviews": {
      const loc = await db
        .prepare(
          `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        )
        .bind(input.location_id, orgId, siteId)
        .first();
      if (!loc) return { error: "Location not found." };
      const { results } = await db
        .prepare(
          `SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
                owner_reply_at, photo_urls, source, status, created_at, updated_at
         FROM reviews
         WHERE site_id = ? AND location_id = ?
         ORDER BY created_at DESC`,
        )
        .bind(siteId, input.location_id)
        .all();
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

    case "get_location_media": {
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
      const { results } = await db
        .prepare(
          `SELECT id, kind, provider, public_url, thumbnail_url, alt_text, mime_type, file_name, created_at
         FROM media_assets WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(...params)
        .all();
      return results ?? [];
    }

    case "delete_media_asset": {
      const { deleteMediaAsset } =
        await import("~/server/utils/media-asset-manager");
      await deleteMediaAsset(db, env, input.asset_id, siteId);
      return { asset_id: input.asset_id, deleted: true };
    }

    case "import_menu_from_pending_media": {
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
        provider: "chowbot",
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

    case "get_location_qa": {
      const loc = await db
        .prepare(
          `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        )
        .bind(input.location_id, orgId, siteId)
        .first();
      if (!loc) return { error: "Location not found." };
      return listLocationQa(db, siteId, input.location_id);
    }

    case "add_qa": {
      const loc = await db
        .prepare(
          `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        )
        .bind(input.location_id, orgId, siteId)
        .first();
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

    case "delete_qa": {
      const loc = await db
        .prepare(
          `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
        )
        .bind(input.location_id, orgId, siteId)
        .first();
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

    case "get_contact_submissions": {
      const { results } = await db
        .prepare(
          `SELECT id, name, email, message, created_at FROM contact_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(siteId)
        .all();
      return results ?? [];
    }

    case "get_reservation_submissions": {
      const { results } = await db
        .prepare(
          `SELECT id, name, email, phone, party_size, requested_date, requested_time, status, created_at
         FROM reservation_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(siteId)
        .all();
      return results ?? [];
    }

    case "get_site_content_page": {
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
      const drafts = await getDraftContent(
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
        drafts,
      };
    }

    case "save_site_content_field": {
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
        const id = `draft::${orgId}::${siteId}::${targetLocationId ?? "site"}::${page}::${field}`;

        // Map field to component identifier for dynamic rendering
        const component = getComponentFromField(field);

        await upsertDraftContent(db, {
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
        draft: true,
      };
    }

    case "publish_site_content_page": {
      const page = getToolString(input, "page", 40);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };

      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);

      await publishDrafts(db, orgId, siteId, page, targetLocationId);
      return { page, location_id: targetLocationId ?? null, published: true };
    }

    case "discard_site_content_page": {
      const page = getToolString(input, "page", 40);
      if (!page || !isSiteContentPage(page)) return { error: "Invalid page." };

      const targetLocationId =
        typeof input.location_id === "string" && input.location_id.trim()
          ? input.location_id.trim()
          : (ctx.locationId ?? undefined);

      await discardDrafts(db, orgId, siteId, page, targetLocationId);
      return { page, location_id: targetLocationId ?? null, discarded: true };
    }

    case "delete_site_content_field": {
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
          await deleteDraftContentField(
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
        await deleteDraftContentField(
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
          db
            .prepare(
              `SELECT status, COUNT(*) as count FROM posts WHERE organization_id = ? AND site_id = ? GROUP BY status`,
            )
            .bind(orgId, siteId)
            .all(),
          db
            .prepare(
              `SELECT COUNT(*) as count FROM menus WHERE organization_id = ? AND site_id = ?`,
            )
            .bind(orgId, siteId)
            .first(),
          db
            .prepare(
              `SELECT COUNT(*) as count FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.organization_id = ? AND m.site_id = ?`,
            )
            .bind(orgId, siteId)
            .first(),
          db
            .prepare(
              `SELECT COUNT(*) as count FROM business_locations WHERE organization_id = ? AND site_id = ? AND status = 'active'`,
            )
            .bind(orgId, siteId)
            .first(),
          db
            .prepare(
              `SELECT COUNT(*) as count FROM reviews WHERE site_id = ? AND status = 'approved'`,
            )
            .bind(siteId)
            .first(),
        ]);
      const byStatus = (
        (postStats.results ?? []) as unknown as StatusCountRow[]
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

    case "list_site_languages": {
      return await listSiteLocales(db, orgId, siteId);
    }

    case "save_site_language": {
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

    case "delete_site_language": {
      const locale = toSqlText(input.locale)?.trim();
      if (!locale) return { error: "locale is required." };
      return await deleteSiteLocale(db, orgId, siteId, locale);
    }

    case "estimate_site_translation": {
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

    case "start_site_translation_job": {
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
      const { results } = await db
        .prepare(
          `
        SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
               estimated_credits, actual_credits, processed_items, failed_items, created_at, updated_at
        FROM translation_jobs
        WHERE organization_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `,
        )
        .bind(orgId, siteId)
        .all();
      return results ?? [];
    }

    case "get_translation_job": {
      const jobId = toSqlText(input.job_id)?.trim();
      if (!jobId) return { error: "job_id is required." };
      const job = await db
        .prepare(
          `
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `,
        )
        .bind(jobId, orgId, siteId)
        .first();
      if (!job) return { error: "Translation job not found." };
      const { results } = await db
        .prepare(
          `
        SELECT entity_type, entity_id, location_id, page, field, source_chars, status, error
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 100
      `,
        )
        .bind(jobId, orgId, siteId)
        .all();
      return { job, items: results ?? [] };
    }

    case "run_translation_job_batch": {
      const jobId = toSqlText(input.job_id)?.trim();
      if (!jobId) return { error: "job_id is required." };
      return await processTranslationJobBatch(db, env, orgId, siteId, jobId);
    }

    case "publish_site_translations": {
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
      const slots = Array.isArray(input.time_slots)
        ? input.time_slots.map(String)
        : null;
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
          duration_minutes:
            typeof input.duration_minutes === "number"
              ? Math.round(input.duration_minutes)
              : null,
          max_capacity:
            typeof input.max_capacity === "number"
              ? Math.round(input.max_capacity)
              : null,
          time_slots: slots,
          available_note: toSqlText(input.available_note) ?? null,
          image_asset_id: toSqlText(input.image_asset_id) ?? null,
          video_asset_id: toSqlText(input.video_asset_id) ?? null,
          images,
          location_id: toSqlText(input.location_id) ?? null,
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
      const { updateExperience } = await import("~/server/utils/experiences");
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
      const deleted = await deleteExperience(db, siteId, id);
      if (!deleted) return { error: "Experience not found" };
      return { deleted: true };
    }

    case "list_experience_bookings": {
      const { listExperienceBookings } =
        await import("~/server/utils/experiences");
      const id = toSqlText(input.experience_id);
      if (!id) return { error: "experience_id is required" };
      const bookings = await listExperienceBookings(db, siteId, id);
      return { bookings };
    }

    case "update_experience_booking_status": {
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

      // Check org entitlement before insert
      const entitlementsRow = await db
        .prepare("SELECT entitlements FROM organization WHERE id = ?")
        .bind(orgId)
        .first<{ entitlements: string }>();
      let entitlements: Record<string, unknown> = {};
      try {
        entitlements = entitlementsRow?.entitlements
          ? JSON.parse(entitlementsRow.entitlements)
          : {};
      } catch (_) {
        // malformed JSON — treat as empty entitlements
      }
      if (!entitlements.work_requests)
        return { error: "Work requests require a Growth plan or above." };

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
    const loc = await db
      .prepare(
        `SELECT title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
      )
      .bind(locationId, siteId)
      .first<{ title: string }>();
    locationName = loc?.title ?? null;
  }

  const isSetup = currentPage === "setup";

  const SETUP_PREAMBLE = isSetup
    ? `
You are in SETUP MODE. Your job is to guide the restaurant owner through a structured setup interview to get their site live.

Setup order (ask one topic at a time, save each answer immediately using tools before moving on):
1. Greet the owner warmly. Confirm the restaurant name — if they want to change it call rename_site.
2. Ask for the primary location — accept a Google Maps URL (use lookup_maps_url), or typed address. Use create_location to save immediately.
3. Ask for opening hours if not captured from Google Maps. Use update_location to save.
4. Ask for the first menu: "What dishes do you serve? List a few items with prices or paste your menu." Use create_menu then add_menu_items_batch then publish_menu.
5. Ask for a one-line brand description (for SEO and the homepage hero). Use save_brand_description to save immediately.
6. Summarise what was set up and tell them they can publish from the Overview page when ready.

Rules in setup mode:
- Ask ONE question at a time. Wait for the answer before moving to the next topic.
- Save answers IMMEDIATELY with tools before asking the next question. Never batch questions.
- Be warm, concise, and encouraging. First impressions matter.
- If the owner pastes a Google Maps link, call lookup_maps_url immediately then create_location.
- If they paste a menu list, call create_menu then add_menu_items_batch then publish_menu immediately.
- Never ask for information already visible from the site context above.
- If the owner skips a step, acknowledge it and move forward.
`
    : "";

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using Krabiclaw.
Help manage all site content with concise, action-oriented responses.
${SETUP_PREAMBLE}
Site: ${siteName}
Default menu currency: ${opts.defaultCurrency}
Current page: ${currentPage}${locationId ? `\nCurrent location: ${locationName ?? locationId} (id: ${locationId})` : ""}
${opts.pendingMedia ? `Pending WhatsApp media: asset_id ${opts.pendingMedia.assetId}. Use this asset_id directly in any tool that accepts image/media — update_menu_item (image_asset_id), add_menu_item (image_asset_id), add_menu_items_batch (image_asset_id), update_location or create_location (hero_image_asset_id / hero_video_asset_id), create_post (image_asset_id). If the user wants to import/extract menu items from it, call import_menu_from_pending_media. If the user wants to just save it to the library without assigning it, call resolve_pending_media with action=save_media. To discard, call resolve_pending_media with action=cancel. After using it in a tool call, also call resolve_pending_media with action=save_media to clear the pending state. If the user's intent is unclear, ask one short clarifying question.` : ""}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create, update, delete, publish (standard/offer/event/update with CTA) — optionally location-scoped
- Menus: create, rename, view, rename/delete sections/categories, add brand-new items, reconcile/update item lists, update/delete individual items, publish, delete
- Locations: list, create, update, delete (title syncs slug, plus manual address, hours, maps URL, Place ID, rating, review count, description, email, website, socials, price level, hero media), lookup from Google Maps URL
- Reviews: get, create manual reviews, update manual reviews, reply as owner, delete reviews
- Media: list per location, delete, generate AI images with the configured OpenAI image model (auto-saved, returns asset_id)
- Q&A: list, add, delete per location
- Experiences: list, create (title, tagline, rich body, price, duration, capacity, time slots, image, SEO), update, delete, view/confirm/cancel guest bookings
- Contact & reservation submissions: read
- Managed service requests: submit work to Paul & Julia's queue (content, translation, SEO, Google Business, seasonal, photos, social media)
- Site: rename (updates subdomain), set default menu currency, manage languages, read/write site page content (including reservation policies via reservations page)
- Translations: estimate site translation cost, queue translation jobs, inspect translation jobs, run translation batches, publish reviewed drafts
- Platform admin pages: read/write/delete about, contact, help content
- Stats: posts, menus, locations, reviews

Guidelines:
- Use tools immediately — never say "I'll do that" without calling a tool
- For existing menu edits, replacements, revised prices/descriptions, renamed dishes, or mixed create/update work, inspect the menu with get_menu and then use sync_menu_items or update_menu_item
- For menu category changes like renaming Appetizers to Starters or Drinks to Beverages, use rename_menu_section
- For deleting one dish use delete_menu_item; for deleting a whole category and all dishes inside it use delete_menu_section
- Store menu prices as price_amount only. Use the site default currency for display unless the user asks to change the currency, then call set_default_currency.
- Use add_menu_items_batch only when the user is clearly adding brand-new items that are not already on the menu
- Never use add_menu_items_batch to replace, revise, rename, or update existing menu items
- When creating menus, omit location_id — the server links it to the current location automatically
- Use get_site_content_page, save_site_content_field, and delete_site_content_field with page: 'reservations' when the user asks about reservation rules, hold times, cancellation windows, or deposits
- Use list_site_languages, save_site_language, and delete_site_language when the user asks to add, publish, disable, delete, or change the source language for translated site versions
- Use estimate_site_translation before start_site_translation_job; tell the owner item count and estimated credits, then get confirmation before queuing the job
- Use run_translation_job_batch only after a job exists and the owner confirms spending credits; it processes one batch and saves translations as drafts
- Use publish_site_translations after the owner confirms drafted translations should go live; published languages become visible on the public site
- Use get_site_content_page, save_site_content_field, publish_site_content_page, discard_site_content_page, and delete_site_content_field for tenant page content such as home, about, contact, location notes, and reservations
- Before publish_post, delete_post, publish_menu, delete_menu, delete_menu_item, delete_menu_section, delete_location, delete_media_asset, delete_qa, delete_site_content_field, delete_site_language, start_site_translation_job, run_translation_job_batch, publish_site_translations — confirm first
- Menus are DRAFT by default — publish_menu makes them live
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
          tools: TOOLS,
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

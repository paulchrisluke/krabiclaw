import { callAiGateway, type AiTool, type AiMessage } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { listPosts, createPost, publishPost } from '~/server/utils/post-management'
import { getMenus, getMenuWithItems, createMenu, updateMenu, createMenuItem, updateMenuItem, deleteMenuItem, deleteMenu, renameMenuSection, deleteMenuSection } from '~/server/utils/menu-management'
import { deleteDraftContentField, deleteSiteContentField, discardDrafts, getDraftContent, getPageContent, getSiteContentField, publishDrafts, upsertDraftContent, upsertSiteContent } from '~/server/utils/content-management'
import { setConfig } from '~/server/utils/site-config'
import { getPlaceDetails, searchPlaces } from '~/server/utils/google-places'
import { extractMenuFromMediaAsset } from '~/server/utils/chowbot-media'
import { upsertChannelState } from '~/server/utils/chowbot-conversations'
import { CHOWBOT_MODEL } from '~/server/utils/ai-models'
import { contentRegistry, getFieldDef } from '~/config/content-registry'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'
import type { MenuItem, UpdateMenuItemRequest } from '~/server/types/menu'

const MAX_ITERATIONS = 10
const MAX_SLUG_ATTEMPTS = 10
const RESERVATIONS_PAGE = 'reservations'
const RESERVATION_POLICIES_FIELD = 'policies.body'
const HERO_FIELDS = new Set(['hero.title', 'hero.subtitle', 'hero.image', 'hero.video'])
const PLATFORM_PAGES = ['about', 'contact', 'help'] as const

type SqlBindValue = string | number | boolean | null
export type JsonSerializable = string | number | boolean | null | JsonSerializable[] | { [key: string]: JsonSerializable }

interface AiImagePayload {
  image?: string
}

export interface ChowBotIncomingMessage {
  role: 'user' | 'assistant'
  content: string | JsonSerializable
}

export interface ChowBotToolCall {
  name: string
  input: JsonSerializable
  result: JsonSerializable
}

export interface ChowBotRunEvent {
  type: 'tool_start' | 'tool_done' | 'text' | 'done' | 'error'
  name?: string
  content?: string
  message?: string
  toolCalls?: ChowBotToolCall[]
  creditsRemaining?: number | null
}

export interface RunChowBotOptions {
  db: D1Database
  env: ApiRecord
  orgId: string
  siteId: string
  userId: string
  siteName: string
  defaultCurrency: string
  messages: ChowBotIncomingMessage[]
  currentPage?: string
  locationId?: string | null
  channel?: 'dashboard' | 'whatsapp'
  pendingMedia?: { assetId: string; siteId: string }
  onEvent?: (_event: ChowBotRunEvent) => Promise<void> | void
}

export interface RunChowBotResult {
  responseText: string
  toolCalls: ChowBotToolCall[]
  creditsRemaining: number | null
}

interface StatusCountRow {
  status: string
  count: number
}

const toSlug = (s: string) => {
  const normalized = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  if (normalized) return normalized

  let hash = 0
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  return `site-${hash.toString(36) || '0'}`
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return /UNIQUE constraint failed/i.test(message)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function toSqlText(value: ApiValue): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

function menuItemKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function menuItemLookupKey(name: string): string {
  const key = menuItemKey(name)
  return key || name.trim().toLowerCase()
}

function getToolString(record: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined
}

function getToolStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === 'string')
  }
  return undefined
}

function getToolBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function normalizeAddressLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function isSiteContentPage(page: string): page is keyof typeof contentRegistry {
  return Object.prototype.hasOwnProperty.call(contentRegistry, page)
}

function isHeroField(field: string): field is 'hero.title' | 'hero.subtitle' | 'hero.image' | 'hero.video' {
  return HERO_FIELDS.has(field)
}

function heroColumnForField(field: 'hero.title' | 'hero.subtitle' | 'hero.image' | 'hero.video') {
  if (field === 'hero.title') return 'hero_title'
  if (field === 'hero.subtitle') return 'hero_subtitle'
  if (field === 'hero.image') return 'hero_image_asset_id'
  return 'hero_video_asset_id'
}

async function readHeroContentState(db: D1Database, orgId: string, siteId: string, page: string, locationId?: string) {
  const liveRow = await getSiteContentField(db, orgId, siteId, locationId ?? null, page, 'hero')
  const draftRow = locationId
    ? await db.prepare(
        `SELECT id, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, updated_at
         FROM site_content_drafts
         WHERE organization_id = ? AND site_id = ? AND page = ? AND field = 'hero' AND location_id = ?
         LIMIT 1`
      ).bind(orgId, siteId, page, locationId).first<Record<string, unknown>>()
    : await db.prepare(
        `SELECT id, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, updated_at
         FROM site_content_drafts
         WHERE organization_id = ? AND site_id = ? AND page = ? AND field = 'hero' AND location_id IS NULL
         LIMIT 1`
      ).bind(orgId, siteId, page).first<Record<string, unknown>>()

  const base = draftRow ?? liveRow ?? null
  return {
    id: typeof base?.id === 'string' ? base.id : undefined,
    hero_title: typeof base?.hero_title === 'string' ? base.hero_title : null,
    hero_subtitle: typeof base?.hero_subtitle === 'string' ? base.hero_subtitle : null,
    hero_image_asset_id: typeof base?.hero_image_asset_id === 'string' ? base.hero_image_asset_id : null,
    hero_video_asset_id: typeof base?.hero_video_asset_id === 'string' ? base.hero_video_asset_id : null,
  }
}

function isEmptyHeroState(state: { hero_title: string | null; hero_subtitle: string | null; hero_image_asset_id: string | null; hero_video_asset_id: string | null }) {
  return !state.hero_title && !state.hero_subtitle && !state.hero_image_asset_id && !state.hero_video_asset_id
}

function isPlatformPage(page: string): page is typeof PLATFORM_PAGES[number] {
  return PLATFORM_PAGES.includes(page as typeof PLATFORM_PAGES[number])
}

async function upsertHeroContentState(
  db: D1Database,
  orgId: string,
  siteId: string,
  page: string,
  locationId: string | undefined,
  state: { hero_title: string | null; hero_subtitle: string | null; hero_image_asset_id: string | null; hero_video_asset_id: string | null },
) {
  const id = `content::${orgId}::${siteId}::${locationId ?? 'site'}::${page}::hero`
  const payload = {
    id,
    organization_id: orgId,
    site_id: siteId,
    location_id: locationId,
    page,
    field: 'hero',
    value: undefined,
    type: 'text',
    source: 'manual',
    content: undefined,
    hero_title: state.hero_title ?? undefined,
    hero_subtitle: state.hero_subtitle ?? undefined,
    hero_image_asset_id: state.hero_image_asset_id ?? undefined,
    hero_video_asset_id: state.hero_video_asset_id ?? undefined,
  }

  await upsertSiteContent(db, payload)
  await upsertDraftContent(db, payload)
}

function getToolNumber(record: Record<string, unknown>, key: string): number | null | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function getToolInteger(record: Record<string, unknown>, key: string): number | null | undefined {
  const numeric = getToolNumber(record, key)
  if (numeric === undefined || numeric === null) return numeric
  return Number.isInteger(numeric) ? numeric : undefined
}

function findMenuItemMatch(itemRecord: Record<string, unknown>, menuItems: MenuItem[]): MenuItem | null {
  const itemId = getToolString(itemRecord, 'item_id', 120)
  if (itemId) {
    return menuItems.find((item) => item.id === itemId) ?? null
  }

  const name = getToolString(itemRecord, 'name', 200)?.trim()
  if (!name) return null

  const key = menuItemLookupKey(name)
  const lowerName = name.toLowerCase()
  return menuItems.find((item) => item.slug === key || item.name.toLowerCase() === lowerName) ?? null
}

function buildMenuItemUpdates(itemRecord: Record<string, unknown>, match?: MenuItem | null): UpdateMenuItemRequest {
  const updates: UpdateMenuItemRequest = {}
  const section = getToolString(itemRecord, 'section', 100)
  const name = getToolString(itemRecord, 'name', 200)
  const description = getToolString(itemRecord, 'description', 500)
  const price = getToolString(itemRecord, 'price', 50)
  const imageAssetId = getToolString(itemRecord, 'image_asset_id', 120)
  const available = getToolBoolean(itemRecord, 'available')
  
  const allergens = getToolStringArray(itemRecord, 'allergens')
  const ingredients = getToolStringArray(itemRecord, 'ingredients')
  const dietary_notes = getToolStringArray(itemRecord, 'dietary_notes')
  const preparation = getToolString(itemRecord, 'preparation', 500)
  const serving_note = getToolString(itemRecord, 'serving_note', 500)

  if (section !== undefined && section.trim() && section !== match?.section) updates.section = section
  if (name !== undefined && name !== match?.name) updates.name = name
  if (description !== undefined && description !== match?.description) updates.description = description
  if (price !== undefined && price !== match?.price) updates.price = price
  if (imageAssetId !== undefined && imageAssetId !== match?.image_asset_id) updates.image_asset_id = imageAssetId
  if (available !== undefined && available !== Boolean(match?.available)) updates.available = available
  
  if (allergens !== undefined) updates.allergens = allergens
  if (ingredients !== undefined) updates.ingredients = ingredients
  if (dietary_notes !== undefined) updates.dietary_notes = dietary_notes
  if (preparation !== undefined && preparation !== match?.preparation) updates.preparation = preparation
  if (serving_note !== undefined && serving_note !== match?.serving_note) updates.serving_note = serving_note

  return updates
}

function hasMenuItemUpdates(updates: UpdateMenuItemRequest): boolean {
  return Object.keys(updates).length > 0
}

const TOOLS: AiTool[] = [
  // ── Posts ──────────────────────────────────────────────────────────────────
  {
    name: 'get_posts',
    description: 'List posts for this site. Optionally filter by status or location.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'published', 'archived'], description: 'Filter by status. Omit to get all.' },
        location_id: { type: 'string', description: 'Filter to posts for a specific location.' },
      },
    },
  },
  {
    name: 'create_post',
    description: 'Create a new draft post. Saved as draft — NOT published until publish_post is called.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short headline (max 80 chars). Optional.' },
        body: { type: 'string', description: 'Post body (max 400 chars). Friendly, warm tone.' },
        image_asset_id: { type: 'string', description: 'Optional media asset ID from generate_image or get_location_media.' },
        location_id: { type: 'string', description: 'Pin this post to a specific location. Omit for site-wide.' },
        post_type: { type: 'string', enum: ['standard', 'offer', 'event', 'update'], description: 'Post type. Default: standard.' },
        cta_type: { type: 'string', enum: ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'], description: 'Call-to-action button type.' },
        cta_url: { type: 'string', description: 'URL for the CTA button.' },
        event_title: { type: 'string', description: 'Event name (for post_type: event).' },
        event_start: { type: 'string', description: 'Event start datetime ISO string.' },
        event_end: { type: 'string', description: 'Event end datetime ISO string.' },
        offer_coupon: { type: 'string', description: 'Coupon code (for post_type: offer).' },
        offer_terms: { type: 'string', description: 'Offer terms and conditions.' },
      },
      required: ['body'],
    },
  },
  {
    name: 'publish_post',
    description: 'Publish a draft post to the website. Only call after confirming content with the user.',
    input_schema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'ID of the post to publish.' },
      },
      required: ['post_id'],
    },
  },

  // ── Menus ──────────────────────────────────────────────────────────────────
  {
    name: 'get_menu',
    description: 'Get a menu with all its sections and items.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Specific menu ID. Omit to get the first available menu.' },
      },
    },
  },
  {
    name: 'create_menu',
    description: 'Create a new menu.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Menu name.' },
        description: { type: 'string', description: 'Optional description.' },
        location_id: { type: 'string', description: 'Link to a specific location.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_menu',
    description: 'Rename an existing menu.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu.' },
        name: { type: 'string', description: 'New name.' },
        description: { type: 'string', description: 'Optional new description.' },
      },
      required: ['menu_id', 'name'],
    },
  },
  {
    name: 'rename_menu_section',
    description: 'Rename a menu category/section, such as Appetizers, Drinks, Mains, or Desserts. Updates all items in that section.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu.' },
        old_section: { type: 'string', description: 'Current section/category title.' },
        new_section: { type: 'string', description: 'New section/category title.' },
      },
      required: ['menu_id', 'old_section', 'new_section'],
    },
  },
  {
    name: 'delete_menu_section',
    description: 'Permanently delete a menu category/section and every item in it. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu.' },
        section: { type: 'string', description: 'Section/category title to delete.' },
      },
      required: ['menu_id', 'section'],
    },
  },
  {
    name: 'add_menu_items_batch',
    description: 'Add multiple brand-new menu items in one call. Do not use for edits, replacements, renamed items, revised prices, or existing menu content. Up to 100 items.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Menu to add items to.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              section: { type: 'string', description: 'Section/category name.' },
              name: { type: 'string', description: 'Dish name.' },
              description: { type: 'string', description: 'Short description. Optional.' },
              price: { type: 'string', description: 'Price string, e.g. "฿120". Optional.' },
              image_asset_id: { type: 'string', description: 'Media asset ID from generate_image. Optional.' },
              allergens: { type: 'array', items: { type: 'string' }, description: 'List of allergens, e.g. ["dairy", "nuts"].' },
              ingredients: { type: 'array', items: { type: 'string' }, description: 'Key ingredients.' },
              dietary_notes: { type: 'array', items: { type: 'string' }, description: 'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].' },
              preparation: { type: 'string', description: 'How the dish is prepared.' },
              serving_note: { type: 'string', description: 'Notes about serving size or accompaniment.' },
            },
            required: ['section', 'name'],
          },
        },
      },
      required: ['menu_id', 'items'],
    },
  },
  {
    name: 'sync_menu_items',
    description: 'Reconcile a menu item list with an existing menu. Use this for menu updates, replacements, revised prices/descriptions, renamed items, or mixed create/update work.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Menu to update.' },
        items: {
          type: 'array',
          description: 'Items to reconcile. Existing items match by item_id first, then by normalized name/slug.',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string', description: 'Existing menu item ID when known.' },
              section: { type: 'string', description: 'Section/category name.' },
              name: { type: 'string', description: 'Dish name.' },
              description: { type: 'string', description: 'Short description. Optional.' },
              price: { type: 'string', description: 'Price string, e.g. "฿120". Optional.' },
              image_asset_id: { type: 'string', description: 'Media asset ID from generate_image. Optional.' },
              available: { type: 'boolean', description: 'Whether the item should be shown as available.' },
              allergens: { type: 'array', items: { type: 'string' }, description: 'List of allergens.' },
              ingredients: { type: 'array', items: { type: 'string' }, description: 'Key ingredients.' },
              dietary_notes: { type: 'array', items: { type: 'string' }, description: 'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].' },
              preparation: { type: 'string' },
              serving_note: { type: 'string' },
            },
          },
        },
        set_missing_unavailable: {
          type: 'boolean',
          description: 'Only true when the user explicitly asks to remove, replace, hide, or make omitted items unavailable.',
        },
      },
      required: ['menu_id', 'items'],
    },
  },
  {
    name: 'add_menu_item',
    description: 'Add a single item to a menu.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Menu to add to.' },
        section: { type: 'string', description: 'Section/category.' },
        name: { type: 'string', description: 'Dish name.' },
        description: { type: 'string', description: 'Short description. Optional.' },
        price: { type: 'string', description: 'Price string. Optional.' },
        image_asset_id: { type: 'string', description: 'Media asset ID from generate_image. Optional.' },
        allergens: { type: 'array', items: { type: 'string' } },
        ingredients: { type: 'array', items: { type: 'string' } },
        dietary_notes: { type: 'array', items: { type: 'string' } },
        preparation: { type: 'string' },
        serving_note: { type: 'string' },
      },
      required: ['menu_id', 'section', 'name'],
    },
  },
  {
    name: 'update_menu_item',
    description: 'Update a menu item — name, price, description, image, availability, allergens, ingredients, dietary tags, preparation, or serving note.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID of the item.' },
        section: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'string' },
        image_asset_id: { type: 'string', description: 'New media asset ID from generate_image.' },
        available: { type: 'boolean' },
        allergens: { type: 'array', items: { type: 'string' } },
        ingredients: { type: 'array', items: { type: 'string' } },
        dietary_notes: { type: 'array', items: { type: 'string' } },
        preparation: { type: 'string' },
        serving_note: { type: 'string' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'delete_menu_item',
    description: 'Permanently delete one menu item. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Menu ID for verification.' },
        item_id: { type: 'string', description: 'ID of the item.' },
      },
      required: ['menu_id', 'item_id'],
    },
  },
  {
    name: 'publish_menu',
    description: 'Publish a draft menu so it appears on the live site.',
    input_schema: {
      type: 'object',
      properties: { menu_id: { type: 'string' } },
      required: ['menu_id'],
    },
  },
  {
    name: 'delete_menu',
    description: 'Permanently delete a menu and all its items. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: { menu_id: { type: 'string' } },
      required: ['menu_id'],
    },
  },

  // ── Locations ──────────────────────────────────────────────────────────────
  {
    name: 'get_locations',
    description: 'List all locations for this site.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_location',
    description: 'Create a new location/branch.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Location name.' },
        city: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        email: { type: 'string' },
        website_url: { type: 'string' },
        maps_url: { type: 'string' },
        google_place_id: { type: 'string' },
        description: { type: 'string', description: 'About this location.' },
        short_description: { type: 'string', description: 'One-line tagline.' },
        opening_hours: { type: 'string', description: 'Opening hours, one line per day.' },
        rating: { type: 'number', description: 'Manual review rating from 0 to 5.' },
        review_count: { type: 'integer', description: 'Manual total review count.' },
        price_level: { type: 'string', enum: ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'] },
        facebook_url: { type: 'string' },
        instagram_url: { type: 'string' },
        tiktok_url: { type: 'string' },
        hero_image_asset_id: { type: 'string', description: 'Media asset ID for hero image.' },
        hero_video_asset_id: { type: 'string', description: 'Media asset ID for hero video.' },
        is_primary: { type: 'boolean' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_location',
    description: 'Update a location. Updating title auto-syncs the URL slug.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'ID from get_locations.' },
        title: { type: 'string', description: 'New name — also updates URL slug.' },
        city: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        email: { type: 'string' },
        website_url: { type: 'string' },
        maps_url: { type: 'string' },
        google_place_id: { type: 'string' },
        description: { type: 'string', description: 'About this location.' },
        short_description: { type: 'string', description: 'One-line tagline.' },
        opening_hours: { type: 'string', description: 'Opening hours, one line per day.' },
        rating: { type: 'number', description: 'Manual review rating from 0 to 5.' },
        review_count: { type: 'integer', description: 'Manual total review count.' },
        price_level: { type: 'string', enum: ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'] },
        facebook_url: { type: 'string' },
        instagram_url: { type: 'string' },
        tiktok_url: { type: 'string' },
        hero_image_asset_id: { type: 'string', description: 'Media asset ID for hero image.' },
        hero_video_asset_id: { type: 'string', description: 'Media asset ID for hero video.' },
        is_primary: { type: 'boolean' },
        status: { type: 'string', enum: ['active', 'inactive', 'sync_error'] },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'delete_location',
    description: 'Permanently delete a location/branch. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'ID from get_locations.' },
      },
      required: ['location_id'],
    },
  },

  // ── Maps lookup ────────────────────────────────────────────────────────────
  {
    name: 'lookup_maps_url',
    description: 'Look up a Google Maps URL or share link to get location details — address, phone, coordinates, hours. Use when someone pastes a Google Maps link and wants to update their location details. After getting results, call update_location with the relevant fields.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Google Maps URL or share link (e.g. https://maps.app.goo.gl/... or https://www.google.com/maps/place/...)' },
      },
      required: ['url'],
    },
  },

  // ── Reviews ────────────────────────────────────────────────────────────────
  {
    name: 'get_reviews',
    description: 'Get reviews for a location, including aggregate score and star distribution.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'Location ID from get_locations.' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'reply_to_review',
    description: 'Add or update the owner reply on a review.',
    input_schema: {
      type: 'object',
      properties: {
        review_id: { type: 'string', description: 'Review ID from get_reviews.' },
        reply: { type: 'string', description: 'Owner reply text.' },
      },
      required: ['review_id', 'reply'],
    },
  },
  {
    name: 'create_review',
    description: 'Create a manual customer review for a location.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'Location ID from get_locations.' },
        author_name: { type: 'string', description: 'Guest name.' },
        rating: { type: 'integer', description: '1 to 5 stars.' },
        title: { type: 'string', description: 'Optional short review title.' },
        content: { type: 'string', description: 'Review text.' },
        created_at: { type: 'string', description: 'Optional ISO date/time for the review.' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Default approved.' },
      },
      required: ['location_id', 'author_name', 'rating', 'content'],
    },
  },
  {
    name: 'update_review',
    description: 'Update a manual customer review.',
    input_schema: {
      type: 'object',
      properties: {
        review_id: { type: 'string', description: 'Review ID from get_reviews.' },
        author_name: { type: 'string' },
        rating: { type: 'integer', description: '1 to 5 stars.' },
        title: { type: 'string' },
        content: { type: 'string' },
        created_at: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
      },
      required: ['review_id'],
    },
  },
  {
    name: 'delete_review',
    description: 'Permanently delete a review. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        review_id: { type: 'string', description: 'Review ID from get_reviews.' },
      },
      required: ['review_id'],
    },
  },

  // ── Media ──────────────────────────────────────────────────────────────────
  {
    name: 'get_location_media',
    description: 'List media assets (images, videos) for a location.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'Location ID from get_locations.' },
        kind: { type: 'string', enum: ['image', 'video', 'file'], description: 'Filter by media type. Omit for all.' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'delete_media_asset',
    description: 'Delete a media asset from the library and Cloudflare storage. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'ID from get_location_media.' },
      },
      required: ['asset_id'],
    },
  },
  {
    name: 'import_menu_from_pending_media',
    description: 'Import menu items from the currently pending WhatsApp image or document. Use only when the user asks to import, extract, or read menu items from the pending file.',
    input_schema: {
      type: 'object',
      properties: {
        menu_name: { type: 'string', description: 'Optional draft menu name.' },
      },
    },
  },
  {
    name: 'resolve_pending_media',
    description: 'Resolve the currently pending WhatsApp media without importing it. Use when the user wants to save the already-uploaded media as-is or cancel the pending media task.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save_media', 'cancel'] },
      },
      required: ['action'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an AI image from a text prompt using Flux. The image is automatically saved to the media library. Use for menu item photos, hero images, or social posts.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Describe the image. Include food type, style, plating, lighting. Be specific.' },
        location_id: { type: 'string', description: 'Optional: attach the generated image to a specific location.' },
      },
      required: ['prompt'],
    },
  },

  // ── Q&A ────────────────────────────────────────────────────────────────────
  {
    name: 'get_location_qa',
    description: 'Get Q&A pairs for a location.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'add_qa',
    description: 'Add a Q&A pair to a location.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string' },
        question: { type: 'string' },
        answer: { type: 'string', description: 'Owner answer. Optional — can be added later.' },
      },
      required: ['location_id', 'question'],
    },
  },
  {
    name: 'delete_qa',
    description: 'Delete a Q&A entry. Confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        qa_id: { type: 'string' },
        location_id: { type: 'string' },
      },
      required: ['qa_id', 'location_id'],
    },
  },

  // ── Submissions ────────────────────────────────────────────────────────────
  {
    name: 'get_contact_submissions',
    description: 'List contact form submissions for this site.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_reservation_submissions',
    description: 'List reservation requests for this site.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_reservation_policies',
    description: 'Read the reservation policy copy for this site.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'save_reservation_policies',
    description: 'Update the live reservation policy copy for this site.',
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Reservation policy HTML or rich text.' },
      },
      required: ['body'],
    },
  },
  {
    name: 'delete_reservation_policies',
    description: 'Remove the custom reservation policy copy and restore the default. Confirm with the user first.',
    input_schema: { type: 'object', properties: {} },
  },

  // ── Site Content ──────────────────────────────────────────────────────────
  {
    name: 'get_site_content_page',
    description: 'Read the current live and draft content for a tenant site page.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(contentRegistry), description: 'Site page to inspect.' },
        location_id: { type: 'string', description: 'Optional location scope for location-specific pages.' },
      },
      required: ['page'],
    },
  },
  {
    name: 'save_site_content_field',
    description: 'Save a draft value for a site page field.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(contentRegistry), description: 'Site page to update.' },
        field: { type: 'string', description: 'Field key from the content registry.' },
        value: { type: 'string', description: 'New field value.' },
        location_id: { type: 'string', description: 'Optional location scope for location-specific pages.' },
      },
      required: ['page', 'field', 'value'],
    },
  },
  {
    name: 'publish_site_content_page',
    description: 'Publish all draft content for a site page.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(contentRegistry), description: 'Site page to publish.' },
        location_id: { type: 'string', description: 'Optional location scope for location-specific pages.' },
      },
      required: ['page'],
    },
  },
  {
    name: 'discard_site_content_page',
    description: 'Discard all draft content for a site page.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(contentRegistry), description: 'Site page to reset.' },
        location_id: { type: 'string', description: 'Optional location scope for location-specific pages.' },
      },
      required: ['page'],
    },
  },
  {
    name: 'delete_site_content_field',
    description: 'Delete a site page field from live content and drafts. Confirm with the user first.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: Object.keys(contentRegistry), description: 'Site page that owns the field.' },
        field: { type: 'string', description: 'Field key from the content registry.' },
        location_id: { type: 'string', description: 'Optional location scope for location-specific pages.' },
      },
      required: ['page', 'field'],
    },
  },

  // ── Platform Content ──────────────────────────────────────────────────────
  {
    name: 'get_platform_content_page',
    description: 'Read a platform admin content page.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: [...PLATFORM_PAGES], description: 'Platform page to inspect.' },
      },
      required: ['page'],
    },
  },
  {
    name: 'save_platform_content_page',
    description: 'Update a platform admin content page.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: [...PLATFORM_PAGES], description: 'Platform page to update.' },
        content: { type: 'string', description: 'Raw page content.' },
      },
      required: ['page', 'content'],
    },
  },
  {
    name: 'delete_platform_content_page',
    description: 'Delete a platform admin content page. Confirm with the user first.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: [...PLATFORM_PAGES], description: 'Platform page to delete.' },
      },
      required: ['page'],
    },
  },

  // ── Site ───────────────────────────────────────────────────────────────────
  {
    name: 'get_site_stats',
    description: 'Summary of site content: posts, menus, menu items, locations, reviews.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'rename_site',
    description: 'Update the brand name and subdomain/URL slug of the site.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string', description: 'New brand name.' },
      },
      required: ['brand_name'],
    },
  },
  {
    name: 'set_default_currency',
    description: 'Set the default menu currency for this site.',
    input_schema: {
      type: 'object',
      properties: {
        currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
      },
      required: ['currency'],
    },
  },
  {
    name: 'save_brand_description',
    description: 'Save a one-line brand description for the site homepage and SEO.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'One-line brand description.' },
      },
      required: ['description'],
    },
  },
]

const CONFIRM_REQUIRED = new Set(['publish_post', 'publish_menu', 'delete_menu', 'delete_menu_item', 'delete_menu_section', 'delete_location', 'delete_review', 'delete_media_asset', 'delete_qa', 'delete_reservation_policies', 'delete_site_content_field', 'delete_platform_content_page'])

function isAllowedGoogleMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'maps.app.goo.gl'
    || host === 'maps.google.com'
    || host === 'google.com'
    || host.endsWith('.google.com')
}

function requiresConfirmation(name: string, recentMessages: AiMessage[]): boolean {
  if (!CONFIRM_REQUIRED.has(name)) return false
  const CONFIRM_WORDS = /\b(yes|yea|yeah|yep|yup|ok|okay|go ahead|do it|do that|publish|confirm|proceed|sure|absolutely|fine|sounds good|let'?s go)\b/i
  const userTurns = recentMessages.filter(m => m.role === 'user').slice(-3)
    .map(m => (typeof m.content === 'string' ? m.content : ''))
  return !userTurns.some(t => CONFIRM_WORDS.test(t))
}

async function executeTool(
  name: string,
  input: ApiRecord,
  ctx: {
    db: D1Database
    env: ApiRecord
    orgId: string
    siteId: string
    userId: string
    agentMessages?: AiMessage[]
    locationId?: string | null
    channel?: 'dashboard' | 'whatsapp'
    pendingMedia?: { assetId: string; siteId: string }
  }
): Promise<ApiValue> {
  const { db, env, orgId, siteId, userId } = ctx

  if (requiresConfirmation(name, ctx.agentMessages ?? [])) {
    return { __requires_confirmation: true, message: `Please confirm you want to ${name.replace(/_/g, ' ')}.` }
  }

  switch (name) {
    case 'get_posts': {
      const posts = await listPosts(db, orgId, siteId, input.status)
      const filtered = input.location_id
        ? posts.filter((p) => p.location_id === input.location_id)
        : posts
      return filtered.slice(0, 10).map((p) => ({
        id: p.id, title: p.title,
        body: p.body.slice(0, 120) + (p.body.length > 120 ? '…' : ''),
        status: p.status, post_type: p.post_type, location_id: p.location_id, updated_at: p.updated_at,
      }))
    }

    case 'create_post': {
      const post = await createPost(db, orgId, siteId, {
        title: input.title, body: input.body, image_asset_id: input.image_asset_id,
        location_id: input.location_id, post_type: input.post_type,
        cta_type: input.cta_type, cta_url: input.cta_url,
        event_title: input.event_title, event_start: input.event_start, event_end: input.event_end,
        offer_coupon: input.offer_coupon, offer_terms: input.offer_terms,
      }, userId)
      return { id: post.id, title: post.title, body: post.body, status: post.status, post_type: post.post_type }
    }

    case 'publish_post': {
      const result = await publishPost(db, orgId, siteId, input.post_id, ['site'])
      if (!result) return { error: 'Post not found or already published.' }
      return { id: result.id, title: result.title, status: result.status, published_at: result.published_at }
    }

    case 'get_menu': {
      if (input.menu_id) {
        const menu = await getMenuWithItems(db, orgId, siteId, input.menu_id)
        if (!menu) return { error: 'Menu not found.' }
        return menu
      }
      // Filter by current location when available so we only see relevant menus
      const locationFilter = (input.location_id as string | undefined) ?? ctx.locationId ?? undefined
      const menus = await getMenus(db, orgId, siteId, locationFilter || undefined)
      if (!menus.length) return { message: 'No menus found for this site.' }
      return await getMenuWithItems(db, orgId, siteId, menus[0]!.id) ?? { error: 'Failed to load menu.' }
    }

    case 'create_menu': {
      // Use the explicit location from the AI, fall back to the page's current location
      const effectiveLocationId = (input.location_id as string | undefined) ?? ctx.locationId ?? undefined
      if (effectiveLocationId) {
        const location = await db.prepare(`
          SELECT 1 FROM business_locations
          WHERE id = ? AND organization_id = ? AND site_id = ?
          LIMIT 1
        `).bind(effectiveLocationId, orgId, siteId).first()
        if (!location) return { error: 'Location not found or access denied' }
      }
      const menu = await createMenu(db, orgId, siteId, { name: input.name, description: input.description, locationId: effectiveLocationId }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'rename_menu': {
      const menu = await updateMenu(db, orgId, siteId, input.menu_id, { name: input.name, description: input.description }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'rename_menu_section': {
      const menuId = toSqlText(input.menu_id)
      const oldSection = toSqlText(input.old_section)?.trim()
      const newSection = toSqlText(input.new_section)?.trim()
      if (!menuId || !oldSection || !newSection) {
        return { error: 'menu_id, old_section, and new_section are required.' }
      }
      if (oldSection === newSection) {
        return { error: 'New section must be different.' }
      }

      const menu = await getMenuWithItems(db, orgId, siteId, menuId)
      if (!menu) return { error: 'Menu not found.' }
      if (!menu.items.some((item) => item.section === oldSection)) {
        return { error: 'Section not found.' }
      }
      if (menu.items.some((item) => item.section === newSection)) {
        return { error: 'Section already exists.' }
      }

      const updated = await renameMenuSection(db, menuId, oldSection, newSection, userId)
      return { menu_id: menuId, old_section: oldSection, new_section: newSection, updated }
    }

    case 'delete_menu_section': {
      const menuId = toSqlText(input.menu_id)
      const section = toSqlText(input.section)?.trim()
      if (!menuId || !section) return { error: 'menu_id and section are required.' }

      const menu = await getMenuWithItems(db, orgId, siteId, menuId)
      if (!menu) return { error: 'Menu not found.' }
      if (!menu.items.some((item) => item.section === section)) {
        return { error: 'Section not found.' }
      }

      const deleted = await deleteMenuSection(db, menuId, section)
      return { menu_id: menuId, section, deleted }
    }

    case 'add_menu_items_batch': {
      const menuId = toSqlText(input.menu_id)
      if (!menuId) return { error: 'menu_id is required.' }
      const menu = await getMenuWithItems(db, orgId, siteId, menuId)
      if (!menu) return { error: 'Menu not found.' }

      const items: unknown[] = Array.isArray(input.items) ? input.items.slice(0, 100) : []
      const existingKeys = new Set(menu.items.map((item) => item.slug || menuItemLookupKey(item.name)))
      const inputKeys = new Set<string>()
      const created: Array<{ id: string; name: string; section: string; price: string | null }> = []
      const skipped: Array<{ name: string; reason: string; existing_item_id?: string }> = []

      for (const item of items) {
        const itemRecord = (item && typeof item === 'object') ? item as Record<string, unknown> : null
        const name = itemRecord ? getToolString(itemRecord, 'name', 200)?.trim() : ''
        if (!itemRecord || !name) {
          skipped.push({ name: '', reason: 'missing_name' })
          continue
        }
        const section = itemRecord ? getToolString(itemRecord, 'section', 100)?.trim() : ''
        if (!section) {
          skipped.push({ name, reason: 'missing_section' })
          continue
        }

        const key = menuItemLookupKey(name)
        const existing = menu.items.find((menuItem) => menuItem.slug === key || menuItem.name.toLowerCase() === name.toLowerCase())
        if (existing || existingKeys.has(key)) {
          skipped.push({ name, reason: 'already_exists', existing_item_id: existing?.id })
          continue
        }
        if (inputKeys.has(key)) {
          skipped.push({ name, reason: 'duplicate_in_request' })
          continue
        }

        inputKeys.add(key)

        try {
          const createdItem = await createMenuItem(db, menuId, {
            section,
            name,
            description: getToolString(itemRecord, 'description', 500),
            price: getToolString(itemRecord, 'price', 50),
            image_asset_id: getToolString(itemRecord, 'image_asset_id', 120),
          }, userId)
          existingKeys.add(createdItem.slug || menuItemLookupKey(createdItem.name))
          created.push({ id: createdItem.id, name: createdItem.name, section: createdItem.section, price: createdItem.price })
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error
          skipped.push({ name, reason: 'unique_conflict' })
        }
      }

      return { added: created.length, created, skipped, menu_id: menuId }
    }

    case 'sync_menu_items': {
      const menuId = toSqlText(input.menu_id)
      if (!menuId) return { error: 'menu_id is required.' }
      const menu = await getMenuWithItems(db, orgId, siteId, menuId)
      if (!menu) return { error: 'Menu not found.' }

      const items: unknown[] = Array.isArray(input.items) ? input.items.slice(0, 100) : []
      const workingItems = [...menu.items]
      const touchedItemIds = new Set<string>()
      const created: Array<{ id: string; name: string; section: string; price: string | null }> = []
      const updated: Array<{ id: string; name: string; section: string; price: string | null; available: boolean }> = []
      const unchanged: Array<{ id: string; name: string }> = []
      const skipped: Array<{ name: string; reason: string; item_id?: string }> = []

      for (const item of items) {
        const itemRecord = (item && typeof item === 'object') ? item as Record<string, unknown> : null
        if (!itemRecord) {
          skipped.push({ name: '', reason: 'invalid_item' })
          continue
        }

        const name = getToolString(itemRecord, 'name', 200)?.trim()
        const match = findMenuItemMatch(itemRecord, workingItems)

        if (match) {
          const updates = buildMenuItemUpdates(itemRecord, match)
          touchedItemIds.add(match.id)

          if (!hasMenuItemUpdates(updates)) {
            unchanged.push({ id: match.id, name: match.name })
            continue
          }

          try {
            const updatedItem = await updateMenuItem(db, match.id, updates, userId)
            const index = workingItems.findIndex((menuItem) => menuItem.id === updatedItem.id)
            if (index >= 0) workingItems[index] = updatedItem
            updated.push({
              id: updatedItem.id,
              name: updatedItem.name,
              section: updatedItem.section,
              price: updatedItem.price,
              available: Boolean(updatedItem.available),
            })
          } catch (error) {
            if (!isUniqueConstraintError(error)) throw error
            skipped.push({ name: name || match.name, reason: 'unique_conflict', item_id: match.id })
          }
          continue
        }

        if (!name) {
          skipped.push({ name: '', reason: 'missing_name' })
          continue
        }
        const section = getToolString(itemRecord, 'section', 100)?.trim()
        if (!section) {
          skipped.push({ name, reason: 'missing_section' })
          continue
        }

        try {
          const createdItem = await createMenuItem(db, menuId, {
            section,
            name,
            description: getToolString(itemRecord, 'description', 500),
            price: getToolString(itemRecord, 'price', 50),
            image_asset_id: getToolString(itemRecord, 'image_asset_id', 120),
            available: getToolBoolean(itemRecord, 'available'),
          }, userId)
          workingItems.push(createdItem)
          touchedItemIds.add(createdItem.id)
          created.push({ id: createdItem.id, name: createdItem.name, section: createdItem.section, price: createdItem.price })
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error
          skipped.push({ name, reason: 'unique_conflict' })
        }
      }

      const madeUnavailable: Array<{ id: string; name: string }> = []
      if (input.set_missing_unavailable === true) {
        for (const item of workingItems) {
          if (touchedItemIds.has(item.id) || !item.available) continue
          const updatedItem = await updateMenuItem(db, item.id, { available: false }, userId)
          madeUnavailable.push({ id: updatedItem.id, name: updatedItem.name })
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
      }
    }

    case 'add_menu_item': {
      const item = await createMenuItem(db, input.menu_id, {
        section: input.section, name: input.name,
        description: input.description, price: input.price, image_asset_id: input.image_asset_id,
      }, userId)
      return { id: item.id, name: item.name, section: item.section, price: item.price }
    }

    case 'update_menu_item': {
      const updates: Record<string, string | boolean | null> = {}
      for (const f of ['section', 'name', 'description', 'price', 'image_asset_id', 'available']) {
        if (input[f] !== undefined) updates[f] = input[f]
      }
      const item = await updateMenuItem(db, input.item_id, updates, userId)
      return { id: item.id, name: item.name, price: item.price, available: item.available }
    }

    case 'delete_menu_item': {
      const menuId = toSqlText(input.menu_id)
      const itemId = toSqlText(input.item_id)
      if (!menuId || !itemId) return { error: 'menu_id and item_id are required.' }

      const menu = await getMenuWithItems(db, orgId, siteId, menuId)
      if (!menu) return { error: 'Menu not found.' }
      const item = menu.items.find((menuItem) => menuItem.id === itemId)
      if (!item) return { error: 'Menu item not found.' }

      await deleteMenuItem(db, itemId)
      return { menu_id: menuId, item_id: itemId, name: item.name, deleted: true }
    }

    case 'publish_menu': {
      const now = new Date().toISOString()
      const result = await db.prepare(
        `UPDATE menus SET status = 'published', updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(now, userId, input.menu_id, orgId, siteId).run()
      if (!result.meta.changes || result.meta.changes === 0) {
        return { error: 'Menu not found or access denied.' }
      }
      return { menu_id: input.menu_id, status: 'published' }
    }

    case 'delete_menu': {
      await deleteMenu(db, orgId, siteId, input.menu_id)
      return { menu_id: input.menu_id, deleted: true }
    }

    case 'get_locations': {
      const rows = await db.prepare(
        `SELECT id, slug, title, city, phone, email, website_url, maps_url, google_place_id,
                rating, review_count, description, short_description, price_level,
                instagram_url, facebook_url, tiktok_url, hero_image_asset_id, hero_video_asset_id,
                status, is_primary
         FROM business_locations WHERE organization_id = ? AND site_id = ? ORDER BY is_primary DESC, title ASC`
      ).bind(orgId, siteId).all()
      return rows.results ?? []
    }

    case 'create_location': {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const title = toSqlText(input.title)?.trim()
      if (!title) return { error: 'title is required.' }
      const baseSlug = toSlug(title)
      const rating = getToolNumber(input, 'rating')
      if (rating !== undefined && rating !== null && (rating < 0 || rating > 5)) {
        return { error: 'rating must be between 0 and 5.' }
      }
      const reviewCount = getToolInteger(input, 'review_count')
      if (reviewCount !== undefined && reviewCount !== null && reviewCount < 0) {
        return { error: 'review_count must be a whole number greater than or equal to 0.' }
      }
      const isPrimary = getToolBoolean(input, 'is_primary') === true

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

        try {
          const statements: D1PreparedStatement[] = []
          if (isPrimary) {
            statements.push(db.prepare(
              `UPDATE business_locations SET is_primary = 0, updated_at = ? WHERE organization_id = ? AND site_id = ?`
            ).bind(now, orgId, siteId))
          }
          statements.push(db.prepare(
            `INSERT INTO business_locations (
              id, organization_id, site_id, title, slug, city, phone, email, website_url, maps_url,
              google_place_id, description, short_description, address, opening_hours, rating,
              review_count, price_level, facebook_url, instagram_url, tiktok_url,
              hero_image_asset_id, hero_video_asset_id, is_primary, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          ).bind(
            id,
            orgId,
            siteId,
            title,
            slug,
            toSqlText(input.city) ?? null,
            toSqlText(input.phone) ?? null,
            toSqlText(input.email) ?? null,
            toSqlText(input.website_url) ?? null,
            toSqlText(input.maps_url) ?? null,
            toSqlText(input.google_place_id) ?? null,
            toSqlText(input.description) ?? null,
            toSqlText(input.short_description) ?? null,
            (() => {
              const normalizedAddress = toSqlText(input.address)
              if (normalizedAddress === null || normalizedAddress === undefined) return null
              const addressLines = normalizeAddressLines(String(normalizedAddress))
              return addressLines.length ? JSON.stringify({ addressLines }) : null
            })(),
            input.opening_hours ? JSON.stringify({ weekdayDescriptions: String(input.opening_hours).split('\n').map(line => line.trim()).filter(Boolean) }) : null,
            rating ?? null,
            reviewCount ?? null,
            toSqlText(input.price_level) ?? null,
            toSqlText(input.facebook_url) ?? null,
            toSqlText(input.instagram_url) ?? null,
            toSqlText(input.tiktok_url) ?? null,
            toSqlText(input.hero_image_asset_id) ?? null,
            toSqlText(input.hero_video_asset_id) ?? null,
            isPrimary ? 1 : 0,
            now,
            now
          ))
          if (isPrimary) {
            statements.push(db.prepare(
              `UPDATE sites SET primary_location_id = ?, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ?`
            ).bind(id, now, userId, siteId, orgId))
          }
          await db.batch(statements)
          return { id, title, slug, status: 'active' }
        } catch (error) {
          if (isUniqueConstraintError(error)) continue
          throw error
        }
      }

      throw new Error(`Unable to allocate a unique location slug after ${MAX_SLUG_ATTEMPTS} attempts`)
    }

    case 'update_location': {
      const now = new Date().toISOString()
      const locationId = toSqlText(input.location_id)
      if (!locationId) {
        return { error: 'location_id is required.' }
      }
      const location = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(locationId, orgId, siteId).first()
      if (!location) return { error: 'Location not found.' }

      const sets: string[] = ['updated_at = ?']
      const params: SqlBindValue[] = [now]
      let slugParamIndex: number | null = null
      let slugBase: string | null = null
      const normalizedTitle = toSqlText(input.title)
      if (normalizedTitle !== undefined) {
        if (!normalizedTitle?.trim()) return { error: 'title cannot be empty.' }
        sets.push('title = ?', 'slug = ?')
        slugBase = toSlug(normalizedTitle)
        params.push(normalizedTitle, slugBase)
        slugParamIndex = params.length - 1
      }
      const simpleFields = ['city', 'phone', 'email', 'description', 'short_description', 'price_level',
        'facebook_url', 'instagram_url', 'tiktok_url', 'website_url', 'maps_url', 'google_place_id',
        'hero_image_asset_id', 'hero_video_asset_id', 'status'] as const
      for (const field of simpleFields) {
        const normalizedValue = toSqlText(input[field])
        if (normalizedValue !== undefined) {
          if (field === 'status' && normalizedValue && !['active', 'inactive', 'sync_error'].includes(normalizedValue)) {
            return { error: 'Invalid location status.' }
          }
          sets.push(`${field} = ?`)
          params.push(normalizedValue)
        }
      }
      if (input.address !== undefined) {
        const normalizedAddress = toSqlText(input.address)
        sets.push('address = ?')
        if (normalizedAddress === null) {
          params.push(null)
        } else {
          const addressLines = normalizeAddressLines(String(normalizedAddress))
          params.push(addressLines.length ? JSON.stringify({ addressLines }) : null)
        }
      }
      if (input.opening_hours !== undefined) {
        const normalizedHours = toSqlText(input.opening_hours)
        sets.push('opening_hours = ?')
        params.push(normalizedHours === null ? null : JSON.stringify({ weekdayDescriptions: String(normalizedHours ?? '').split('\n').map(line => line.trim()).filter(Boolean) }))
      }
      if (input.rating !== undefined) {
        const rating = getToolNumber(input, 'rating')
        if (rating === undefined || (rating !== null && (rating < 0 || rating > 5))) return { error: 'rating must be between 0 and 5.' }
        sets.push('rating = ?')
        params.push(rating)
      }
      if (input.review_count !== undefined) {
        const reviewCount = getToolInteger(input, 'review_count')
        if (reviewCount === undefined || (reviewCount !== null && reviewCount < 0)) return { error: 'review_count must be a whole number greater than or equal to 0.' }
        sets.push('review_count = ?')
        params.push(reviewCount)
      }
      const isPrimary = getToolBoolean(input, 'is_primary')
      if (isPrimary !== undefined) {
        sets.push('is_primary = ?')
        params.push(isPrimary ? 1 : 0)
      }

      const runLocationUpdate = async (boundParams: SqlBindValue[]) => {
        const statements: D1PreparedStatement[] = []
        if (isPrimary === true) {
          statements.push(db.prepare(
            `UPDATE business_locations SET is_primary = 0, updated_at = ? WHERE organization_id = ? AND site_id = ?`
          ).bind(now, orgId, siteId))
          statements.push(db.prepare(
            `UPDATE sites SET primary_location_id = ?, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ?`
          ).bind(locationId, now, userId, siteId, orgId))
        } else if (isPrimary === false) {
          statements.push(db.prepare(
            `UPDATE sites SET primary_location_id = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND primary_location_id = ?`
          ).bind(now, userId, siteId, orgId, locationId))
        }
        statements.push(db.prepare(
          `UPDATE business_locations SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ?`
        ).bind(...boundParams))
        await db.batch(statements)
      }

      if (slugBase) {
        let updated = false
        for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
          const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt + 1}`
          const updateParams = [...params]
          if (slugParamIndex === null) {
            return { error: 'Unable to update location slug.' }
          }
          updateParams[slugParamIndex] = slug
          updateParams.push(locationId, orgId, siteId)

          try {
            await runLocationUpdate(updateParams)
            updated = true
            break
          } catch (error) {
            if (isUniqueConstraintError(error)) continue
            throw error
          }
        }

        if (!updated) {
          throw new Error(`Unable to allocate a unique location slug after ${MAX_SLUG_ATTEMPTS} attempts`)
        }
      } else {
        params.push(locationId, orgId, siteId)
        await runLocationUpdate(params)
      }

      const updated = await db.prepare(
        `SELECT id, slug, title, city, phone, email, website_url, maps_url, google_place_id,
                rating, review_count, description, short_description, status, is_primary
         FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(locationId, orgId, siteId).first()
      return updated ?? { error: 'Location not found.' }
    }

    case 'delete_location': {
      const locationId = toSqlText(input.location_id)
      if (!locationId) return { error: 'location_id is required.' }
      const result = await db.prepare(
        `DELETE FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(locationId, orgId, siteId).run()
      if (!result.meta.changes || result.meta.changes === 0) {
        return { error: 'Location not found.' }
      }
      await db.prepare(
        `UPDATE sites SET primary_location_id = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND primary_location_id = ?`
      ).bind(new Date().toISOString(), userId, siteId, orgId, locationId).run()
      return { location_id: locationId, deleted: true }
    }

    case 'lookup_maps_url': {
      const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
      if (!apiKey) return { error: 'Google Places API not configured.' }

      const rawUrl = typeof input.url === 'string' ? input.url.trim() : ''
      if (!rawUrl) return { error: 'url is required.' }

      let parsedRawUrl: URL
      try {
        parsedRawUrl = new URL(rawUrl)
      } catch {
        return { error: 'Invalid URL format.' }
      }

      if (!isAllowedGoogleMapsHost(parsedRawUrl.hostname)) {
        return { error: 'URL does not appear to be a Google Maps link.' }
      }

      // Resolve one redirect hop safely for short URLs.
      let resolvedUrl = parsedRawUrl.toString()
      try {
        const probe = await fetch(parsedRawUrl.toString(), { method: 'HEAD', redirect: 'manual' })
        const location = probe.headers.get('location')
        if (location) {
          const redirected = new URL(location, parsedRawUrl)
          if (!isAllowedGoogleMapsHost(redirected.hostname)) {
            return { error: 'URL redirects to a non-Google host.' }
          }
          resolvedUrl = redirected.toString()
        } else {
          const probeUrl = probe.url || parsedRawUrl.toString()
          const parsedProbeUrl = new URL(probeUrl)
          if (!isAllowedGoogleMapsHost(parsedProbeUrl.hostname)) {
            return { error: 'Resolved URL is not a Google Maps host.' }
          }
          resolvedUrl = parsedProbeUrl.toString()
        }
      } catch { /* keep rawUrl */ }

      try {
        const resolvedHost = new URL(resolvedUrl).hostname
        if (!isAllowedGoogleMapsHost(resolvedHost)) {
          return { error: 'Resolved URL is not a Google Maps host.' }
        }
      } catch {
        return { error: 'Resolved URL is invalid.' }
      }

      // Extract place ID from the canonical URL data parameter: !1s{placeId}
      const placeIdMatch = resolvedUrl.match(/!1s([^!&]+)/)
      const placeId = placeIdMatch?.[1] ?? null

      if (placeId) {
        try {
          const details = await getPlaceDetails(apiKey, placeId)
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
            hint: 'Use update_location with location_id plus the fields above to apply these details.',
          }
        } catch { /* fall through to text search */ }
      }

      // Fallback: extract business name from URL and text-search
      const nameMatch = resolvedUrl.match(/\/maps\/place\/([^/@]+)/)
      const placePath = nameMatch?.[1] ?? ''
      const nameQuery = placePath ? decodeURIComponent(placePath.replace(/\+/g, ' ')) : ''
      if (!nameQuery) return { error: 'Could not extract a place from that URL. Try sharing the full Google Maps link.' }

      const results = await searchPlaces(apiKey, nameQuery)
      if (!results.length) return { error: `No places found for "${nameQuery}".` }

      const top = results[0]!
      return {
        found: true,
        name: top.name,
        address: top.formattedAddress,
        phone: top.phone,
        maps_url: top.mapsUrl,
        latitude: top.lat,
        longitude: top.lng,
        rating: top.rating,
        hint: 'Use update_location with location_id plus the fields above to apply these details.',
      }
    }

    case 'get_reviews': {
      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(input.location_id, orgId, siteId).first()
      if (!loc) return { error: 'Location not found.' }
      const { results } = await db.prepare(
        `SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
                owner_reply_at, photo_urls, source, status, created_at, updated_at
         FROM reviews
         WHERE site_id = ? AND location_id = ?
         ORDER BY created_at DESC`
      ).bind(siteId, input.location_id).all()
      return results ?? []
    }

    case 'reply_to_review': {
      const now = new Date().toISOString()
      const result = await db.prepare(
        `UPDATE reviews SET owner_reply = ?, owner_reply_at = ?, updated_at = ? WHERE id = ? AND site_id = ? AND organization_id = ?`
      ).bind(input.reply, now, now, input.review_id, siteId, orgId).run()
      if (!result.meta.changes || result.meta.changes === 0) {
        return { error: 'Review not found.' }
      }
      return { review_id: input.review_id, replied: true }
    }

    case 'create_review': {
      const locationId = toSqlText(input.location_id)
      const authorName = toSqlText(input.author_name)?.trim()
      const content = toSqlText(input.content)?.trim()
      const rating = getToolInteger(input, 'rating')
      const status = toSqlText(input.status) ?? 'approved'
      if (!locationId) return { error: 'location_id is required.' }
      if (!authorName) return { error: 'author_name is required.' }
      if (!content) return { error: 'content is required.' }
      if (rating === undefined || rating === null || rating < 1 || rating > 5) return { error: 'rating must be between 1 and 5.' }
      if (!['pending', 'approved', 'rejected'].includes(status)) return { error: 'Invalid review status.' }

      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(locationId, orgId, siteId).first()
      if (!loc) return { error: 'Location not found.' }

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const createdAt = toSqlText(input.created_at) ?? now
      await db.prepare(
        `INSERT INTO reviews (
          id, organization_id, site_id, location_id, author_name, rating, title, content,
          status, source, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
      ).bind(
        id,
        orgId,
        siteId,
        locationId,
        authorName,
        rating,
        toSqlText(input.title) ?? null,
        content,
        status,
        createdAt,
        now
      ).run()
      return { id, location_id: locationId, author_name: authorName, rating, status, source: 'manual', created: true }
    }

    case 'update_review': {
      const reviewId = toSqlText(input.review_id)
      if (!reviewId) return { error: 'review_id is required.' }
      const sets: string[] = []
      const params: SqlBindValue[] = []

      if (input.author_name !== undefined) {
        const authorName = toSqlText(input.author_name)?.trim()
        if (!authorName) return { error: 'author_name cannot be empty.' }
        sets.push('author_name = ?')
        params.push(authorName)
      }
      if (input.title !== undefined) {
        sets.push('title = ?')
        params.push(toSqlText(input.title) ?? null)
      }
      if (input.content !== undefined) {
        const content = toSqlText(input.content)?.trim()
        if (!content) return { error: 'content cannot be empty.' }
        sets.push('content = ?')
        params.push(content)
      }
      if (input.rating !== undefined) {
        const rating = getToolInteger(input, 'rating')
        if (rating === undefined || rating === null || rating < 1 || rating > 5) return { error: 'rating must be between 1 and 5.' }
        sets.push('rating = ?')
        params.push(rating)
      }
      if (input.status !== undefined) {
        const status = toSqlText(input.status)
        if (!status || !['pending', 'approved', 'rejected'].includes(status)) return { error: 'Invalid review status.' }
        sets.push('status = ?')
        params.push(status)
      }
      if (input.created_at !== undefined) {
        sets.push('created_at = ?')
        params.push(toSqlText(input.created_at) ?? new Date().toISOString())
      }
      if (!sets.length) return { error: 'No review fields provided.' }

      const now = new Date().toISOString()
      sets.push('updated_at = ?')
      params.push(now, reviewId, orgId, siteId)
      const result = await db.prepare(
        `UPDATE reviews SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(...params).run()
      if (!result.meta.changes || result.meta.changes === 0) {
        return { error: 'Review not found.' }
      }
      const updated = await db.prepare(
        `SELECT id, author_name, rating, title, content, source, status, created_at, updated_at
         FROM reviews WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(reviewId, orgId, siteId).first()
      return updated ?? { error: 'Review not found.' }
    }

    case 'delete_review': {
      const reviewId = toSqlText(input.review_id)
      if (!reviewId) return { error: 'review_id is required.' }
      const result = await db.prepare(
        `DELETE FROM reviews WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(reviewId, orgId, siteId).run()
      if (!result.meta.changes || result.meta.changes === 0) {
        return { error: 'Review not found.' }
      }
      return { review_id: reviewId, deleted: true }
    }

    case 'get_location_media': {
      const conditions = [`site_id = ?`, `location_id = ?`, `status = 'active'`]
      const params: SqlBindValue[] = [siteId, input.location_id]
      if (input.kind) { conditions.push(`kind = ?`); params.push(input.kind) }
      params.push(50)
      const { results } = await db.prepare(
        `SELECT id, kind, provider, public_url, thumbnail_url, alt_text, mime_type, file_name, created_at
         FROM media_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
      ).bind(...params).all()
      return results ?? []
    }

    case 'delete_media_asset': {
      const { deleteMediaAsset } = await import('~/server/utils/media-asset-manager')
      await deleteMediaAsset(db, env, input.asset_id, siteId)
      return { asset_id: input.asset_id, deleted: true }
    }

    case 'import_menu_from_pending_media': {
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: 'No pending WhatsApp media is available to import.' }
      }
      const result = await extractMenuFromMediaAsset(db, env, {
        organizationId: orgId,
        siteId,
        userId,
        assetId: ctx.pendingMedia.assetId,
        menuName: toSqlText(input.menu_name)?.trim() || undefined,
      })
      if (ctx.channel === 'whatsapp') {
        await upsertChannelState(db, {
          userId,
          channel: 'whatsapp',
          selectedSiteId: siteId,
          pendingMedia: null,
          pendingConfirmation: null,
        })
      }
      return {
        asset_id: ctx.pendingMedia.assetId,
        menu_id: result.menuId,
        imported_items: result.count,
        warning: result.warning,
        credits_remaining: result.creditsRemaining,
      }
    }

    case 'resolve_pending_media': {
      if (!ctx.pendingMedia?.assetId || ctx.pendingMedia.siteId !== siteId) {
        return { error: 'No pending WhatsApp media is available to resolve.' }
      }
      const action = toSqlText(input.action)
      if (action !== 'save_media' && action !== 'cancel') {
        return { error: 'action must be save_media or cancel.' }
      }
      if (ctx.channel === 'whatsapp') {
        await upsertChannelState(db, {
          userId,
          channel: 'whatsapp',
          selectedSiteId: siteId,
          pendingMedia: null,
          pendingConfirmation: null,
        })
      }
      return { asset_id: ctx.pendingMedia.assetId, action, resolved: true }
    }

    case 'generate_image': {
      const { uploadImageBuffer } = await import('~/server/utils/cloudflare-images')
      const { createMediaAsset } = await import('~/server/utils/media-asset-manager')
      const ai = env.AI
      if (!ai) return { error: 'AI binding not available.' }
      const result = await ai.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: input.prompt,
        num_steps: 4,
      })
      const aiResult = result as AiImagePayload | null
      const imageBase64 = typeof aiResult?.image === 'string'
        ? aiResult.image.trim()
        : ''
      if (!imageBase64) {
        throw new Error('AI image generation returned an invalid response payload')
      }

      const buffer = Buffer.from(imageBase64, 'base64')
      const imageData = new Uint8Array(buffer).buffer
      const { imageId, publicUrl, thumbnailUrl } = await uploadImageBuffer(
        env, imageData, `chowbot-${Date.now()}.png`
      )
      const assetId = crypto.randomUUID()
      await createMediaAsset(db, {
        id: assetId,
        organization_id: orgId,
        site_id: siteId,
        location_id: input.location_id ?? null,
        kind: 'image',
        provider: 'chowbot',
        source: 'generated',
        cloudflare_image_id: imageId,
        public_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        mime_type: 'image/png',
        status: 'active',
        created_by_user_id: userId,
      })
      await chargeCredits(db, orgId, {
        siteId, action: 'generate_image', model: '@cf/black-forest-labs/flux-1-schnell',
        inputTokens: 0, outputTokens: 4000,
      })
      return { asset_id: assetId, publicUrl, thumbnailUrl }
    }

    case 'get_location_qa': {
      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(input.location_id, orgId, siteId).first()
      if (!loc) return { error: 'Location not found.' }
      const { results } = await db.prepare(
        `SELECT * FROM location_qa WHERE location_id = ?`
      ).bind(input.location_id).all()
      return results ?? []
    }

    case 'add_qa': {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(input.location_id, orgId, siteId).first()
      if (!loc) return { error: 'Location not found.' }
      await db.prepare(
        `INSERT INTO location_qa (id, organization_id, site_id, location_id, question, answer, is_owner_answer, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'manual', ?, ?)`
      ).bind(id, orgId, siteId, input.location_id, input.question, input.answer ?? null, now, now).run()
      return { id, added: true }
    }

    case 'delete_qa': {
      const loc = await db.prepare(
        `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`
      ).bind(input.location_id, orgId, siteId).first()
      if (!loc) return { error: 'Location not found.' }
      await db.prepare(`DELETE FROM location_qa WHERE id = ? AND location_id = ?`).bind(input.qa_id, input.location_id).run()
      return { qa_id: input.qa_id, deleted: true }
    }

    case 'get_contact_submissions': {
      const { results } = await db.prepare(
        `SELECT id, name, email, message, created_at FROM contact_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20`
      ).bind(siteId).all()
      return results ?? []
    }

    case 'get_reservation_submissions': {
      const { results } = await db.prepare(
        `SELECT id, name, email, phone, party_size, requested_date, requested_time, status, created_at
         FROM reservation_submissions WHERE site_id = ? ORDER BY created_at DESC LIMIT 20`
      ).bind(siteId).all()
      return results ?? []
    }

    case 'get_reservation_policies': {
      const defaultBody = getFieldDef(RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD)?.defaultValue ?? ''
      const liveRow = await getSiteContentField(db, orgId, siteId, null, RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD)
      const draftRow = await db.prepare(
        `SELECT content, type, source, updated_at
         FROM site_content_drafts
         WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ? AND location_id IS NULL
         LIMIT 1`
      ).bind(orgId, siteId, RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD).first<{ content: string | null; type: string; source: string; updated_at: string }>()

      return {
        body: liveRow?.content ?? defaultBody,
        default_body: defaultBody,
        live_body: liveRow?.content ?? null,
        draft_body: draftRow?.content ?? null,
        has_custom_policy: Boolean(liveRow?.content),
        has_draft_policy: Boolean(draftRow?.content),
        updated_at: draftRow?.updated_at ?? liveRow?.updated_at ?? null,
      }
    }

    case 'save_reservation_policies': {
      const body = getToolString(input, 'body', 20000)?.trim()
      if (!body) return { error: 'Reservation policy body is required.' }

      const id = `content::${orgId}::${siteId}::site::${RESERVATIONS_PAGE}::${RESERVATION_POLICIES_FIELD}`

      await upsertSiteContent(db, {
        id,
        organization_id: orgId,
        site_id: siteId,
        location_id: undefined,
        page: RESERVATIONS_PAGE,
        field: RESERVATION_POLICIES_FIELD,
        value: body,
        type: 'richtext',
        source: 'manual',
        content: body,
        hero_title: undefined,
        hero_subtitle: undefined,
        hero_image_asset_id: undefined,
        hero_video_asset_id: undefined,
      })

      await deleteDraftContentField(db, orgId, siteId, RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD)

      return { body, updated: true }
    }

    case 'delete_reservation_policies': {
      await deleteSiteContentField(db, orgId, siteId, RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD)
      await deleteDraftContentField(db, orgId, siteId, RESERVATIONS_PAGE, RESERVATION_POLICIES_FIELD)
      return { deleted: true, restored_default: true }
    }

    case 'get_site_content_page': {
      const page = getToolString(input, 'page', 40)
      if (!page || !isSiteContentPage(page)) return { error: 'Invalid page.' }

      const targetLocationId = typeof input.location_id === 'string' && input.location_id.trim()
        ? input.location_id.trim()
        : ctx.locationId ?? undefined

      const live = await getPageContent(db, orgId, siteId, page, targetLocationId)
      const drafts = await getDraftContent(db, orgId, siteId, page, targetLocationId)

      return {
        page,
        location_id: targetLocationId ?? null,
        fields: (contentRegistry[page]?.fields ? Object.keys(contentRegistry[page].fields) : []).map(field => ({
          field,
          label: getFieldDef(page, field)?.label ?? field,
          type: getFieldDef(page, field)?.type ?? 'text',
        })),
        live,
        drafts,
      }
    }

    case 'save_site_content_field': {
      const page = getToolString(input, 'page', 40)
      const field = getToolString(input, 'field', 80)
      const value = getToolString(input, 'value', 20000)
      if (!page || !isSiteContentPage(page)) return { error: 'Invalid page.' }
      if (!field) return { error: 'Field is required.' }

      const fieldDef = getFieldDef(page, field)
      if (!fieldDef) return { error: `Unknown field: ${field}` }

      const targetLocationId = typeof input.location_id === 'string' && input.location_id.trim()
        ? input.location_id.trim()
        : ctx.locationId ?? undefined

      if (isHeroField(field)) {
        const heroState = await readHeroContentState(db, orgId, siteId, page, targetLocationId)
        const nextState = { ...heroState }
        nextState[heroColumnForField(field)] = value ?? null
        await upsertHeroContentState(db, orgId, siteId, page, targetLocationId, nextState)
      } else {
        const id = `draft::${orgId}::${siteId}::${targetLocationId ?? 'site'}::${page}::${field}`
        await upsertDraftContent(db, {
          id,
          organization_id: orgId,
          site_id: siteId,
          location_id: targetLocationId,
          page,
          field,
          value: value ?? undefined,
          type: fieldDef.type,
          source: 'manual',
          content: value ?? undefined,
          hero_title: undefined,
          hero_subtitle: undefined,
          hero_image_asset_id: undefined,
          hero_video_asset_id: undefined,
        })
      }

      return { page, field, value, location_id: targetLocationId ?? null, saved: true, draft: true }
    }

    case 'publish_site_content_page': {
      const page = getToolString(input, 'page', 40)
      if (!page || !isSiteContentPage(page)) return { error: 'Invalid page.' }

      const targetLocationId = typeof input.location_id === 'string' && input.location_id.trim()
        ? input.location_id.trim()
        : ctx.locationId ?? undefined

      await publishDrafts(db, orgId, siteId, page, targetLocationId)
      return { page, location_id: targetLocationId ?? null, published: true }
    }

    case 'discard_site_content_page': {
      const page = getToolString(input, 'page', 40)
      if (!page || !isSiteContentPage(page)) return { error: 'Invalid page.' }

      const targetLocationId = typeof input.location_id === 'string' && input.location_id.trim()
        ? input.location_id.trim()
        : ctx.locationId ?? undefined

      await discardDrafts(db, orgId, siteId, page, targetLocationId)
      return { page, location_id: targetLocationId ?? null, discarded: true }
    }

    case 'delete_site_content_field': {
      const page = getToolString(input, 'page', 40)
      const field = getToolString(input, 'field', 80)
      if (!page || !isSiteContentPage(page)) return { error: 'Invalid page.' }
      if (!field) return { error: 'Field is required.' }

      const targetLocationId = typeof input.location_id === 'string' && input.location_id.trim()
        ? input.location_id.trim()
        : ctx.locationId ?? undefined

      if (isHeroField(field)) {
        const heroState = await readHeroContentState(db, orgId, siteId, page, targetLocationId)
        const nextState = { ...heroState }
        nextState[heroColumnForField(field)] = null
        if (isEmptyHeroState(nextState)) {
          await deleteSiteContentField(db, orgId, siteId, page, 'hero', targetLocationId)
          await deleteDraftContentField(db, orgId, siteId, page, 'hero', targetLocationId)
        } else {
          await upsertHeroContentState(db, orgId, siteId, page, targetLocationId, nextState)
        }
      } else {
        await deleteSiteContentField(db, orgId, siteId, page, field, targetLocationId)
        await deleteDraftContentField(db, orgId, siteId, page, field, targetLocationId)
      }

      return { page, field, location_id: targetLocationId ?? null, deleted: true }
    }

    case 'get_platform_content_page': {
      const page = getToolString(input, 'page', 40)
      if (!page || !isPlatformPage(page)) return { error: 'Invalid page.' }

      const row = await db.prepare(
        `SELECT id, page, content, updated_by, updated_at FROM platform_content WHERE page = ? LIMIT 1`
      ).bind(page).first<{ id: string; page: string; content: string; updated_by: string | null; updated_at: string }>()

      return {
        page,
        exists: Boolean(row),
        content: row?.content ?? '',
        updated_by: row?.updated_by ?? null,
        updated_at: row?.updated_at ?? null,
      }
    }

    case 'save_platform_content_page': {
      const page = getToolString(input, 'page', 40)
      const content = getToolString(input, 'content', 1_000_000)
      if (!page || !isPlatformPage(page)) return { error: 'Invalid page.' }
      if (content === undefined) return { error: 'content is required.' }

      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO platform_content (id, page, content, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(page) DO UPDATE SET content = excluded.content, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      ).bind(id, page, content, userId, now).run()

      return { page, content, updated_at: now, updated: true }
    }

    case 'delete_platform_content_page': {
      const page = getToolString(input, 'page', 40)
      if (!page || !isPlatformPage(page)) return { error: 'Invalid page.' }

      await db.prepare(`DELETE FROM platform_content WHERE page = ?`).bind(page).run()
      return { page, deleted: true }
    }

    case 'get_site_stats': {
      const [postStats, menuCount, itemCount, locationCount, reviewCount] = await Promise.all([
        db.prepare(`SELECT status, COUNT(*) as count FROM posts WHERE organization_id = ? AND site_id = ? GROUP BY status`).bind(orgId, siteId).all(),
        db.prepare(`SELECT COUNT(*) as count FROM menus WHERE organization_id = ? AND site_id = ?`).bind(orgId, siteId).first(),
        db.prepare(`SELECT COUNT(*) as count FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.organization_id = ? AND m.site_id = ?`).bind(orgId, siteId).first(),
        db.prepare(`SELECT COUNT(*) as count FROM business_locations WHERE organization_id = ? AND site_id = ? AND status = 'active'`).bind(orgId, siteId).first(),
        db.prepare(`SELECT COUNT(*) as count FROM reviews WHERE site_id = ? AND status = 'approved'`).bind(siteId).first(),
      ])
      const byStatus = ((postStats.results ?? []) as unknown as StatusCountRow[]).reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count
        return acc
      }, {})
      return {
        posts: { draft: byStatus.draft ?? 0, published: byStatus.published ?? 0, archived: byStatus.archived ?? 0 },
        menus: menuCount?.count ?? 0, menu_items: itemCount?.count ?? 0,
        locations: locationCount?.count ?? 0, reviews: reviewCount?.count ?? 0,
      }
    }

    case 'rename_site': {
      const now = new Date().toISOString()
      const baseSubdomain = toSlug(input.brand_name)
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const subdomain = attempt === 0 ? baseSubdomain : `${baseSubdomain}-${attempt + 1}`
        try {
          await db.prepare(
            `UPDATE sites SET brand_name = ?, subdomain = ?, updated_at = ? WHERE id = ? AND organization_id = ?`
          ).bind(input.brand_name, subdomain, now, siteId, orgId).run()
          return { brand_name: input.brand_name, subdomain, updated: true }
        } catch (error) {
          if (isUniqueConstraintError(error)) continue
          throw error
        }
      }
      return { error: `Unable to allocate a unique subdomain after ${MAX_SLUG_ATTEMPTS} attempts` }
    }

    case 'save_brand_description': {
      const description = toSqlText(input.description)?.trim()
      if (!description) return { error: 'Description is required.' }
      await db.prepare(
        `UPDATE sites SET brand_description = ?, updated_at = ? WHERE id = ? AND organization_id = ?`
      ).bind(description, new Date().toISOString(), siteId, orgId).run()
      return { brand_description: description, updated: true }
    }

    case 'set_default_currency': {
      const currency = toSqlText(input.currency)?.trim().toUpperCase()
      const supportedCurrencies = new Set<string>(SUPPORTED_CURRENCIES)
      if (!currency || !supportedCurrencies.has(currency)) {
        return { error: 'Unsupported currency.' }
      }
      await setConfig(db, orgId, siteId, 'default_currency', currency)
      return { default_currency: currency, updated: true }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function runChowBot(opts: RunChowBotOptions): Promise<RunChowBotResult> {
  const { db, env, orgId, siteId, userId } = opts

  const creditOk = await hasCredits(db, orgId)
  if (!creditOk) throw new Error('No AI credits remaining.')

  if (!Array.isArray(opts.messages) || !opts.messages.length) {
    throw new Error('messages array required')
  }

  const siteName = opts.siteName
  const currentPage = opts.currentPage ?? 'dashboard'
  const locationId = typeof opts.locationId === 'string' && opts.locationId ? opts.locationId : null
  const channel = opts.channel ?? 'dashboard'

  // Resolve current location name for richer context
  let locationName: string | null = null
  if (locationId) {
    const loc = await db.prepare(
      `SELECT title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`
    ).bind(locationId, siteId).first<{ title: string }>()
    locationName = loc?.title ?? null
  }

  const isOnboarding = currentPage === 'onboarding'

  const ONBOARDING_PREAMBLE = isOnboarding ? `
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
` : ''

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using Kikuzuki.
Help manage all site content with concise, action-oriented responses.
${ONBOARDING_PREAMBLE}
Site: ${siteName}
Default menu currency: ${opts.defaultCurrency}
Current page: ${currentPage}${locationId ? `\nCurrent location: ${locationName ?? locationId} (id: ${locationId})` : ''}
${opts.pendingMedia ? `Pending WhatsApp media: asset_id ${opts.pendingMedia.assetId}. If the user wants to import, extract, or read menu items from it, call import_menu_from_pending_media. If the user wants to save it as-is or cancel, call resolve_pending_media. If their intent is unclear, ask a short clarifying question.` : ''}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create (standard/offer/event/update with CTA), publish — optionally location-scoped
- Menus: create, rename, view, rename/delete sections/categories, add brand-new items, reconcile/update item lists, update/delete individual items, publish, delete
- Locations: list, create, update, delete (title syncs slug, plus manual address, hours, maps URL, Place ID, rating, review count, description, email, website, socials, price level, hero media), lookup from Google Maps URL
- Reviews: get, create manual reviews, update manual reviews, reply as owner, delete reviews
- Media: list per location, delete, generate AI images with Flux (auto-saved, returns asset_id)
- Q&A: list, add, delete per location
- Contact & reservation submissions: read
- Site: rename (updates subdomain), set default menu currency, manage reservation policies, read/write site page content
- Platform admin pages: read/write/delete about, contact, help content
- Stats: posts, menus, locations, reviews

Guidelines:
- Use tools immediately — never say "I'll do that" without calling a tool
- For existing menu edits, replacements, revised prices/descriptions, renamed dishes, or mixed create/update work, inspect the menu with get_menu and then use sync_menu_items or update_menu_item
- For menu category changes like renaming Appetizers to Starters or Drinks to Beverages, use rename_menu_section
- For deleting one dish use delete_menu_item; for deleting a whole category and all dishes inside it use delete_menu_section
- Use the default menu currency for new or revised menu prices unless the user gives another currency
- Use add_menu_items_batch only when the user is clearly adding brand-new items that are not already on the menu
- Never use add_menu_items_batch to replace, revise, rename, or update existing menu items
- When creating menus, omit location_id — the server links it to the current location automatically
- Use get_reservation_policies, save_reservation_policies, and delete_reservation_policies when the user asks about reservation rules, hold times, cancellation windows, deposits, or dietary accommodations
- Use get_site_content_page, save_site_content_field, publish_site_content_page, discard_site_content_page, and delete_site_content_field for tenant page content such as home, about, contact, location notes, menu intro, and reservations
- Use get_platform_content_page, save_platform_content_page, and delete_platform_content_page for platform admin pages about, contact, and help
- Before publish_post, publish_menu, delete_menu, delete_menu_item, delete_menu_section, delete_location, delete_review, delete_media_asset, delete_qa — confirm first
- Menus are DRAFT by default — publish_menu makes them live
- Keep responses short — this is a chat panel`

  const MAX_MSG_CHARS = 20000
  let initialMessages = opts.messages.slice(-8)
  while (initialMessages.length > 0 && initialMessages[0]?.role !== 'user') {
    initialMessages = initialMessages.slice(1)
  }
  if (!initialMessages.length) {
    throw new Error('Conversation must contain at least one user message')
  }
  const agentMessages: AiMessage[] = initialMessages.map((m) => {
    const raw = typeof m.content === 'string' ? m.content : String(m.content ?? '')
    return {
      role: m.role as 'user' | 'assistant',
      content: raw.length > MAX_MSG_CHARS ? raw.slice(0, MAX_MSG_CHARS) + '\n…[truncated]' : raw,
    }
  })

  const emit = async (event: ChowBotRunEvent) => {
    if (opts.onEvent) await opts.onEvent(event)
  }

  const ctx = { db, env, orgId, siteId, userId, agentMessages, locationId, channel, pendingMedia: opts.pendingMedia }
  const toolCalls: ChowBotToolCall[] = []
  let totalInput = 0, totalOutput = 0, cfLogId: string | null = null
  let responseText = ''

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let aiResponse
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        aiResponse = await callAiGateway(env, agentMessages, {
          system: SYSTEM, tools: TOOLS, maxTokens: 8192,
          metadata: { org_id: orgId, site_id: siteId, action: 'chowbot' },
        })
        break
      } catch (err) {
        const errorMessage = getErrorMessage(err, '')
        const is429 = errorMessage.includes('429') || errorMessage.includes('rate_limit')
        if (is429 && attempt === 0) { await new Promise(r => setTimeout(r, 8000)); continue }
        const message = is429 ? 'Rate limit hit — please wait a moment.' : getErrorMessage(err, 'AI generation failed.')
        await emit({ type: 'error', message })
        throw new Error(message)
      }
    }
    if (!aiResponse) {
      const message = 'AI generation failed after retry.'
      await emit({ type: 'error', message })
      throw new Error(message)
    }

    totalInput += aiResponse.usage.input_tokens
    totalOutput += aiResponse.usage.output_tokens
    cfLogId = aiResponse.cfLogId

    if (aiResponse.stop_reason === 'end_turn') {
      responseText = aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
      await emit({ type: 'text', content: responseText })
      break
    }

    if (aiResponse.stop_reason === 'tool_use') {
      agentMessages.push({ role: 'assistant', content: aiResponse.content })
      const results: Array<{ type: 'tool_result'; tool_use_id?: string; content: string }> = []
      for (const block of aiResponse.content) {
        if (block.type !== 'tool_use') continue
        await emit({ type: 'tool_start', name: block.name })
        const result = await executeTool(block.name || '', block.input ?? {}, ctx)
        toolCalls.push({ name: block.name || '', input: block.input, result })
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        await emit({ type: 'tool_done', name: block.name })
      }
      agentMessages.push({ role: 'user', content: results })
      continue
    }

    responseText = aiResponse.stop_reason === 'max_tokens'
      ? 'Response too large. Try adding items section by section.'
      : aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
    await emit({ type: 'text', content: responseText })
    break
  }

  // If we exhausted iterations without getting a final response
  if (!responseText) {
    responseText = 'I ran into complexity limits. Please try a simpler request or break it into steps.'
    await emit({ type: 'text', content: responseText })
  }

  const charged = await chargeCredits(db, orgId, {
    siteId, action: 'chowbot', model: CHOWBOT_MODEL,
    inputTokens: totalInput, outputTokens: totalOutput, cfGatewayLogId: cfLogId,
  })

  const result = { responseText, toolCalls, creditsRemaining: charged.newBalance }
  await emit({ type: 'done', toolCalls, creditsRemaining: charged.newBalance })
  return result
}

export function createChowBotStream(
  run: (_onEvent: (_event: ChowBotRunEvent) => Promise<void>) => Promise<void>
) {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  const push = async (data: ChowBotRunEvent) => {
    try { await writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {
      // Client disconnected while streaming.
    }
  }

  ;(async () => {
    try {
      await run(push)
    } catch (err) {
      await push({ type: 'error', message: getErrorMessage(err, 'Something went wrong.') })
    } finally {
      try { await writer.close() } catch {
        // Stream may already be closed after client disconnect.
      }
    }
  })()

  return readable
}

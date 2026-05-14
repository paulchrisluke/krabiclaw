// POST /api/ai/[siteId]/agent
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { callAiGateway, type AiTool, type AiMessage } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { listPosts, createPost, publishPost } from '~/server/utils/post-management'
import { getMenus, getMenuWithItems, createMenu, updateMenu, createMenuItem, updateMenuItem, deleteMenu } from '~/server/utils/menu-management'

const MAX_ITERATIONS = 10
const MODEL = 'claude-sonnet-4-6'
const MAX_SLUG_ATTEMPTS = 10

type SqlBindValue = string | number | boolean | null
type JsonSerializable = string | number | boolean | null | JsonSerializable[] | { [key: string]: JsonSerializable }

interface AiImagePayload {
  image?: string
}

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string | JsonSerializable
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
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
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
    name: 'add_menu_items_batch',
    description: 'Add multiple menu items in one call. ALWAYS use this instead of looping add_menu_item. Up to 100 items.',
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
            },
            required: ['section', 'name'],
          },
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
      },
      required: ['menu_id', 'section', 'name'],
    },
  },
  {
    name: 'update_menu_item',
    description: 'Update a menu item — name, price, description, image, or availability.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID of the item.' },
        name: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'string' },
        image_asset_id: { type: 'string', description: 'New media asset ID from generate_image.' },
        available: { type: 'boolean' },
      },
      required: ['item_id'],
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
        description: { type: 'string', description: 'About this location.' },
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
        description: { type: 'string', description: 'About this location.' },
        short_description: { type: 'string', description: 'One-line tagline.' },
        price_level: { type: 'string', enum: ['FREE', 'INEXPENSIVE', 'MODERATE', 'EXPENSIVE', 'VERY_EXPENSIVE'] },
        facebook_url: { type: 'string' },
        instagram_url: { type: 'string' },
        tiktok_url: { type: 'string' },
        website_url: { type: 'string' },
      },
      required: ['location_id'],
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
]

const CONFIRM_REQUIRED = new Set(['publish_post', 'publish_menu', 'delete_menu', 'delete_media_asset', 'delete_qa'])

function requiresConfirmation(name: string, recentMessages: AiMessage[]): boolean {
  if (!CONFIRM_REQUIRED.has(name)) return false
  const CONFIRM_WORDS = /\b(yes|yea|yeah|yep|yup|ok|okay|go ahead|do it|do that|publish|confirm|proceed|sure|absolutely|fine|sounds good|let'?s go|delete|remove)\b/i
  const userTurns = recentMessages.filter(m => m.role === 'user').slice(-3)
    .map(m => (typeof m.content === 'string' ? m.content : ''))
  return !userTurns.some(t => CONFIRM_WORDS.test(t))
}

async function executeTool(
  name: string,
  input: ApiRecord,
  ctx: { db: D1Database; env: ApiRecord; orgId: string; siteId: string; userId: string; agentMessages?: AiMessage[]; locationId?: string | null }
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
      const menu = await createMenu(db, orgId, siteId, { name: input.name, description: input.description, locationId: effectiveLocationId }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'rename_menu': {
      const menu = await updateMenu(db, orgId, siteId, input.menu_id, { name: input.name, description: input.description }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'add_menu_items_batch': {
      const items: unknown[] = Array.isArray(input.items) ? input.items.slice(0, 100) : []
      const created = await Promise.all(items.map((item) => {
        const itemRecord = (item && typeof item === 'object') ? item : null
        const getString = (key: string): string | undefined => {
          if (!itemRecord) return undefined
          const value = (itemRecord as Record<string, unknown>)[key]
          return typeof value === 'string' ? value : undefined
        }
        return (
        createMenuItem(db, input.menu_id, {
          section: (getString('section') || 'Menu').slice(0, 100),
          name: (getString('name') || '').slice(0, 200),
          description: getString('description')?.slice(0, 500),
          price: getString('price')?.slice(0, 50),
          image_asset_id: getString('image_asset_id'),
        }, userId)
        )
      }))
      return { added: created.length, menu_id: input.menu_id }
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
      for (const f of ['name', 'description', 'price', 'image_asset_id', 'available']) {
        if (input[f] !== undefined) updates[f] = input[f]
      }
      const item = await updateMenuItem(db, input.item_id, updates, userId)
      return { id: item.id, name: item.name, price: item.price, available: item.available }
    }

    case 'publish_menu': {
      const now = new Date().toISOString()
      await db.prepare(
        `UPDATE menus SET status = 'published', updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(now, userId, input.menu_id, orgId, siteId).run()
      return { menu_id: input.menu_id, status: 'published' }
    }

    case 'delete_menu': {
      await deleteMenu(db, orgId, siteId, input.menu_id)
      return { menu_id: input.menu_id, deleted: true }
    }

    case 'get_locations': {
      const rows = await db.prepare(
        `SELECT id, title, city, phone, email, description, price_level, instagram_url, facebook_url, tiktok_url, status, is_primary
         FROM business_locations WHERE organization_id = ? AND site_id = ? ORDER BY is_primary DESC, title ASC`
      ).bind(orgId, siteId).all()
      return rows.results ?? []
    }

    case 'create_location': {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const baseSlug = toSlug(input.title)

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

        try {
          await db.prepare(
            `INSERT INTO business_locations (id, organization_id, site_id, title, slug, city, phone, email, description, address, is_primary, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          ).bind(id, orgId, siteId, input.title, slug, input.city ?? null, input.phone ?? null,
            input.email ?? null, input.description ?? null,
            input.address ? JSON.stringify({ street: input.address }) : null,
            input.is_primary ? 1 : 0, now, now).run()
          return { id, title: input.title, slug, status: 'active' }
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
      const sets: string[] = ['updated_at = ?']
      const params: SqlBindValue[] = [now]
      let slugParamIndex: number | null = null
      let slugBase: string | null = null
      const normalizedTitle = toSqlText(input.title)
      if (normalizedTitle !== undefined) {
        sets.push('title = ?', 'slug = ?')
        slugBase = toSlug(normalizedTitle ?? '')
        params.push(normalizedTitle, slugBase)
        slugParamIndex = params.length - 1
      }
      const simpleFields = ['city', 'phone', 'email', 'description', 'short_description', 'price_level',
        'facebook_url', 'instagram_url', 'tiktok_url', 'website_url'] as const
      for (const field of simpleFields) {
        const normalizedValue = toSqlText(input[field])
        if (normalizedValue !== undefined) {
          sets.push(`${field} = ?`)
          params.push(normalizedValue)
        }
      }
      if (input.address !== undefined) {
        const normalizedAddress = toSqlText(input.address)
        sets.push('address = ?')
        params.push(normalizedAddress === null ? null : JSON.stringify({ street: normalizedAddress ?? '' }))
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
          updateParams.push(locationId, orgId)

          try {
            await db.prepare(`UPDATE business_locations SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`).bind(...updateParams).run()
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
        params.push(locationId, orgId)
        await db.prepare(`UPDATE business_locations SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`).bind(...params).run()
      }

      const updated = await db.prepare(
        `SELECT id, title, city, phone, email, description, status FROM business_locations WHERE id = ? LIMIT 1`
      ).bind(locationId).first()
      return updated ?? { error: 'Location not found.' }
    }

    case 'get_reviews': {
      const { results } = await db.prepare(
        `SELECT id, author_name, rating, title, content, owner_reply, source, created_at
         FROM reviews WHERE location_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 20`
      ).bind(input.location_id).all()
      const reviews = (results ?? []) as Array<{ rating: number | null }>
      const dist = [1,2,3,4,5].map(star => ({ star, count: reviews.filter((r) => r.rating === star).length }))
      const loc = await db.prepare(`SELECT rating, review_count FROM business_locations WHERE id = ? LIMIT 1`).bind(input.location_id).first()
      return { aggregate: { rating: loc?.rating, count: loc?.review_count, distribution: dist }, reviews }
    }

    case 'reply_to_review': {
      const now = new Date().toISOString()
      await db.prepare(
        `UPDATE reviews SET owner_reply = ?, owner_reply_at = ?, updated_at = ? WHERE id = ? AND site_id = ?`
      ).bind(input.reply, now, now, input.review_id, siteId).run()
      return { review_id: input.review_id, replied: true }
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
      const { results } = await db.prepare(
        `SELECT id, question, question_author, answer, answer_date, is_owner_answer, upvote_count
         FROM location_qa WHERE location_id = ? AND status = 'published' ORDER BY is_owner_answer DESC, upvote_count DESC`
      ).bind(input.location_id).all()
      return results ?? []
    }

    case 'add_qa': {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const loc = await db.prepare(`SELECT organization_id, site_id FROM business_locations WHERE id = ? LIMIT 1`).bind(input.location_id).first()
      if (!loc) return { error: 'Location not found.' }
      await db.prepare(
        `INSERT INTO location_qa (id, organization_id, site_id, location_id, question, answer, is_owner_answer, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'manual', ?, ?)`
      ).bind(id, loc.organization_id, loc.site_id, input.location_id, input.question, input.answer ?? null, now, now).run()
      return { id, added: true }
    }

    case 'delete_qa': {
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
      const newSubdomain = toSlug(input.brand_name)
      await db.prepare(
        `UPDATE sites SET brand_name = ?, subdomain = ?, updated_at = ? WHERE id = ? AND organization_id = ?`
      ).bind(input.brand_name, newSubdomain, now, siteId, orgId).run()
      return { brand_name: input.brand_name, subdomain: newSubdomain, updated: true }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id, s.brand_name FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; brand_name: string | null }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const orgId: string = site.organization_id
  const userId: string = session.user.id

  const creditOk = await hasCredits(db, orgId)
  if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })

  let body: { messages?: IncomingMessage[]; currentPage?: string; locationId?: string | null }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return jsonResponse({ error: 'messages array required' }, { status: 400 })
  }

  const siteName = (site.brand_name as string | null) ?? 'your site'
  const currentPage = body.currentPage ?? 'dashboard'
  const locationId = typeof body.locationId === 'string' && body.locationId ? body.locationId : null

  // Resolve current location name for richer context
  let locationName: string | null = null
  if (locationId) {
    const loc = await db.prepare(
      `SELECT title FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`
    ).bind(locationId, siteId).first<{ title: string }>()
    locationName = loc?.title ?? null
  }

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using Kikuzuki.
Help manage all site content with concise, action-oriented responses.

Site: ${siteName}
Current page: ${currentPage}${locationId ? `\nCurrent location: ${locationName ?? locationId} (id: ${locationId})` : ''}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create (standard/offer/event/update with CTA), publish — optionally location-scoped
- Menus: create, rename, view, add items (batch with image_asset_id), update items, publish, delete
- Locations: list, create, update (title syncs slug, plus description/email/socials/price_level)
- Reviews: get (with star distribution), reply as owner
- Media: list per location, delete, generate AI images with Flux (auto-saved, returns asset_id)
- Q&A: list, add, delete per location
- Contact & reservation submissions: read
- Site: rename (updates subdomain)
- Stats: posts, menus, locations, reviews

Guidelines:
- Use tools immediately — never say "I'll do that" without calling a tool
- When adding multiple menu items, ALWAYS use add_menu_items_batch — all items in one call
- When creating menus, omit location_id — the server links it to the current location automatically
- Before publish_post, publish_menu, delete_menu, delete_location_photo, delete_qa — confirm first
- Menus are DRAFT by default — publish_menu makes them live
- Keep responses short — this is a chat panel`

  const MAX_MSG_CHARS = 20000
  let initialMessages = body.messages.slice(-8)
  while (initialMessages.length > 0 && initialMessages[0]?.role !== 'user') {
    initialMessages = initialMessages.slice(1)
  }
  const agentMessages: AiMessage[] = initialMessages.map((m) => {
    const raw = typeof m.content === 'string' ? m.content : String(m.content ?? '')
    return {
      role: m.role as 'user' | 'assistant',
      content: raw.length > MAX_MSG_CHARS ? raw.slice(0, MAX_MSG_CHARS) + '\n…[truncated]' : raw,
    }
  })

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  const push = async (data: object) => {
    try { await writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {
      // Client disconnected while streaming.
    }
  }

  const ctx = { db, env, orgId, siteId, userId, agentMessages, locationId }
  const toolCalls: Array<{ name: string; input: JsonSerializable; result: JsonSerializable }> = []
  let totalInput = 0, totalOutput = 0, cfLogId: string | null = null

  ;(async () => {
    try {
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
            await push({ type: 'error', message: is429 ? 'Rate limit hit — please wait a moment.' : getErrorMessage(err, 'AI generation failed.') })
            return
          }
        }
        if (!aiResponse) {
          await push({ type: 'error', message: 'AI generation failed after retry.' })
          return
        }

        totalInput += aiResponse.usage.input_tokens
        totalOutput += aiResponse.usage.output_tokens
        cfLogId = aiResponse.cfLogId

        if (aiResponse.stop_reason === 'end_turn') {
          await push({ type: 'text', content: aiResponse.content.find((b) => b.type === 'text')?.text ?? '' })
          break
        }

        if (aiResponse.stop_reason === 'tool_use') {
          agentMessages.push({ role: 'assistant', content: aiResponse.content })
          const results: Array<{ type: 'tool_result'; tool_use_id?: string; content: string }> = []
          for (const block of aiResponse.content) {
            if (block.type !== 'tool_use') continue
            await push({ type: 'tool_start', name: block.name })
            const result = await executeTool(block.name || '', block.input ?? {}, ctx)
            toolCalls.push({ name: block.name || '', input: block.input, result })
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
            await push({ type: 'tool_done', name: block.name })
          }
          agentMessages.push({ role: 'user', content: results })
          continue
        }

        if (aiResponse.stop_reason === 'max_tokens') {
          await push({ type: 'text', content: 'Response too large. Try adding items section by section.' })
        } else {
          await push({ type: 'text', content: aiResponse.content.find((b) => b.type === 'text')?.text ?? '' })
        }
        break
      }

      const charged = await chargeCredits(db, orgId, {
        siteId, action: 'chowbot', model: MODEL,
        inputTokens: totalInput, outputTokens: totalOutput, cfGatewayLogId: cfLogId,
      })

      await push({ type: 'done', toolCalls, creditsRemaining: charged.newBalance })
    } catch (err) {
      await push({ type: 'error', message: getErrorMessage(err, 'Something went wrong.') })
    } finally {
      try { await writer.close() } catch {
        // Stream may already be closed after client disconnect.
      }
    }
  })()

  return sendStream(event, readable)
})

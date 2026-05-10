// POST /api/ai/[siteId]/agent
// Conversational agent with tool use. Takes conversation history, runs a tool loop,
// and returns the final text reply plus a log of tool calls made.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { callAiGateway, type AiTool, type AiMessage } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { listPosts, createPost, publishPost } from '~/server/utils/post-management'
import { getMenus, getMenuWithItems, createMenu, updateMenu, createMenuItem, updateMenuItem } from '~/server/utils/menu-management'

const MAX_ITERATIONS = 5
const MODEL = 'claude-sonnet-4-6'

const TOOLS: AiTool[] = [
  {
    name: 'get_posts',
    description: 'List posts for this site. Optionally filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'published', 'archived'],
          description: 'Filter by status. Omit to get all posts.',
        },
      },
    },
  },
  {
    name: 'create_post',
    description: 'Create a new draft post. The post is saved as a draft — NOT published until publish_post is called.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short headline (max 80 chars). Optional.' },
        body: { type: 'string', description: 'Post body (max 400 chars). Friendly, warm tone.' },
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
  {
    name: 'get_menu',
    description: 'Get the current menu with all its sections and items.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'Specific menu ID. Omit to get the first available menu.' },
      },
    },
  },
  {
    name: 'create_menu',
    description: 'Create a new menu. Call this to add a menu like "Take Me Away" or "Ao Nang Menu".',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Menu name, e.g. "Take Me Away" or "Ao Nang Menu".' },
        description: { type: 'string', description: 'Optional description for the menu.' },
        location_id: { type: 'string', description: 'Optional location ID to link this menu to a specific location.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_menu',
    description: 'Rename an existing menu. Use this to change a menu name like renaming "fsad" to "Ao Nang Menu".',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu to rename.' },
        name: { type: 'string', description: 'New menu name.' },
        description: { type: 'string', description: 'Optional new description.' },
      },
      required: ['menu_id', 'name'],
    },
  },
  {
    name: 'confirm_bulk_operation',
    description: 'Ask the user for confirmation before executing a bulk operation (e.g., adding many menu items at once). Call this before firing multiple tool calls to ensure the user wants to proceed.',
    input_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: 'Description of the operation, e.g. "Add 86 menu items to Ao Nang menu".' },
        count: { type: 'number', description: 'Number of items/operations to perform.' },
      },
      required: ['operation', 'count'],
    },
  },
  {
    name: 'get_site_stats',
    description: 'Get a summary of site content: post counts by status, number of menus, number of menu items.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'rename_site',
    description: 'Update the brand name of the site. Also keeps the internal site name in sync.',
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string', description: 'The new brand name.' },
      },
      required: ['brand_name'],
    },
  },
  {
    name: 'get_locations',
    description: 'List all locations (branches) for this site.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_location',
    description: 'Create a new location/branch for this site.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Location name, e.g. "Take Me Away" or "Ao Nang Branch".' },
        city: { type: 'string', description: 'City name.' },
        phone: { type: 'string', description: 'Phone number.' },
        address: { type: 'string', description: 'Street address.' },
        is_primary: { type: 'boolean', description: 'Set as the primary location.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_location',
    description: 'Update an existing location. Updating the title ALSO automatically updates the URL slug to match — pass the desired title to sync the slug. Call get_locations first to get the location ID.',
    input_schema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'ID of the location to update.' },
        title: { type: 'string', description: 'New name. Setting this also regenerates the URL slug.' },
        city: { type: 'string', description: 'City name.' },
        phone: { type: 'string', description: 'Phone number.' },
        address: { type: 'string', description: 'Street address.' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'add_menu_item',
    description: 'Add a new item to a menu. Call get_menu first to get the menu ID.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu to add to.' },
        section: { type: 'string', description: 'Section/category, e.g. "Mains", "Desserts".' },
        name: { type: 'string', description: 'Dish name.' },
        description: { type: 'string', description: 'Short description. Optional.' },
        price: { type: 'string', description: 'Price string, e.g. "฿120". Optional.' },
      },
      required: ['menu_id', 'section', 'name'],
    },
  },
  {
    name: 'update_menu_item',
    description: 'Update an existing menu item — name, price, description, or availability.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID of the menu item to update.' },
        name: { type: 'string', description: 'New name.' },
        description: { type: 'string', description: 'New description.' },
        price: { type: 'string', description: 'New price string.' },
        available: { type: 'boolean', description: 'Set item as available or unavailable.' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'publish_menu',
    description: 'Publish a draft menu so it appears on the live site.',
    input_schema: {
      type: 'object',
      properties: {
        menu_id: { type: 'string', description: 'ID of the menu to publish.' },
      },
      required: ['menu_id'],
    },
  },
]

async function executeTool(
  name: string,
  input: Record<string, any>,
  ctx: { db: any; orgId: string; siteId: string; userId: string }
): Promise<any> {
  const { db, orgId, siteId, userId } = ctx

  switch (name) {
    case 'get_posts': {
      const posts = await listPosts(db, orgId, siteId, input.status)
      return posts.slice(0, 10).map(p => ({
        id: p.id,
        title: p.title,
        body: p.body.slice(0, 120) + (p.body.length > 120 ? '…' : ''),
        status: p.status,
        updated_at: p.updated_at,
      }))
    }

    case 'create_post': {
      const post = await createPost(db, orgId, siteId, { title: input.title, body: input.body }, userId)
      return { id: post.id, title: post.title, body: post.body, status: post.status }
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
      const menus = await getMenus(db, orgId, siteId)
      if (!menus.length) return { message: 'No menus found for this site.' }
      return await getMenuWithItems(db, orgId, siteId, menus[0]!.id) ?? { error: 'Failed to load menu.' }
    }

    case 'create_menu': {
      const menu = await createMenu(db, orgId, siteId, { name: input.name, description: input.description, locationId: input.location_id }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'rename_menu': {
      const menu = await updateMenu(db, orgId, siteId, input.menu_id, { name: input.name, description: input.description }, userId)
      return { id: menu.id, name: menu.name, description: menu.description, status: menu.status }
    }

    case 'confirm_bulk_operation': {
      return {
        confirmation_required: true,
        operation: input.operation,
        count: input.count,
        message: `About to perform: ${input.operation} (${input.count} items). Please confirm by saying "yes" or "proceed".`
      }
    }

    case 'get_site_stats': {
      const [postStats, menuCount, itemCount] = await Promise.all([
        db.prepare(
          'SELECT status, COUNT(*) as count FROM posts WHERE organization_id = ? AND site_id = ? GROUP BY status'
        ).bind(orgId, siteId).all(),
        db.prepare(
          'SELECT COUNT(*) as count FROM menus WHERE organization_id = ? AND site_id = ?'
        ).bind(orgId, siteId).first(),
        db.prepare(
          'SELECT COUNT(*) as count FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.organization_id = ? AND m.site_id = ?'
        ).bind(orgId, siteId).first(),
      ])
      const bySatus = (postStats.results ?? []).reduce((acc: any, row: any) => {
        acc[row.status] = row.count
        return acc
      }, {})
      return {
        posts: { draft: bySatus.draft ?? 0, published: bySatus.published ?? 0, archived: bySatus.archived ?? 0 },
        menus: menuCount?.count ?? 0,
        menu_items: itemCount?.count ?? 0,
      }
    }

    case 'rename_site': {
      const now = new Date().toISOString()
      // Keep name (internal identifier) in sync with brand_name
      await db.prepare(
        'UPDATE sites SET brand_name = ?, name = ?, updated_at = ? WHERE id = ? AND organization_id = ?'
      ).bind(input.brand_name, input.brand_name, now, siteId, orgId).run()
      return { brand_name: input.brand_name, updated: true }
    }

    case 'get_locations': {
      const rows = await db.prepare(
        `SELECT id, title, city, phone, status, is_primary
         FROM business_locations WHERE organization_id = ? AND site_id = ?
         ORDER BY is_primary DESC, title ASC`
      ).bind(orgId, siteId).all()
      return rows.results ?? []
    }

    case 'create_location': {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      await db.prepare(
        `INSERT INTO business_locations
           (id, organization_id, site_id, title, slug, city, phone, address, is_primary, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).bind(
        id, orgId, siteId,
        input.title, slug,
        input.city ?? null, input.phone ?? null,
        input.address ? JSON.stringify({ street: input.address }) : null,
        input.is_primary ? 1 : 0,
        now, now
      ).run()
      return { id, title: input.title, slug, status: 'active' }
    }

    case 'update_location': {
      const now = new Date().toISOString()
      const sets: string[] = ['updated_at = ?']
      const params: any[] = [now]
      if (input.title !== undefined) {
        sets.push('title = ?')
        params.push(input.title)
        // Keep slug in sync with title
        const newSlug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        sets.push('slug = ?')
        params.push(newSlug)
      }
      if (input.city !== undefined)  { sets.push('city = ?');  params.push(input.city) }
      if (input.phone !== undefined) { sets.push('phone = ?'); params.push(input.phone) }
      if (input.address !== undefined) {
        sets.push('address = ?')
        params.push(JSON.stringify({ street: input.address }))
      }
      params.push(input.location_id, orgId)
      await db.prepare(
        `UPDATE business_locations SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`
      ).bind(...params).run()
      const updated = await db.prepare(
        'SELECT id, title, city, phone, status FROM business_locations WHERE id = ? LIMIT 1'
      ).bind(input.location_id).first()
      return updated ?? { error: 'Location not found.' }
    }

    case 'add_menu_item': {
      const item = await createMenuItem(
        db, input.menu_id,
        { section: input.section, name: input.name, description: input.description, price: input.price },
        userId
      )
      return { id: item.id, name: item.name, section: item.section, price: item.price }
    }

    case 'update_menu_item': {
      const updates: any = {}
      if (input.name !== undefined)        updates.name = input.name
      if (input.description !== undefined) updates.description = input.description
      if (input.price !== undefined)       updates.price = input.price
      if (input.available !== undefined)   updates.available = input.available
      const item = await updateMenuItem(db, input.item_id, updates, userId)
      return { id: item.id, name: item.name, price: item.price, available: item.available }
    }

    case 'publish_menu': {
      const now = new Date().toISOString()
      await db.prepare(
        `UPDATE menus SET status = 'published', updated_at = ?, updated_by = ?
         WHERE id = ? AND organization_id = ? AND site_id = ?`
      ).bind(now, userId, input.menu_id, orgId, siteId).run()
      return { menu_id: input.menu_id, status: 'published' }
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
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const orgId: string = site.organization_id
  const userId: string = session.user.id

  const creditOk = await hasCredits(db, orgId)
  if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })

  let body: { messages?: any[]; currentPage?: string }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || !body.messages.length) {
    return jsonResponse({ error: 'messages array required' }, { status: 400 })
  }

  const siteName = (site.brand_name as string | null) ?? 'your site'
  const currentPage = body.currentPage ?? 'dashboard'

  const SYSTEM = `You are ChowBot, an AI assistant for restaurant website owners using KrabiClaw and Chowbot.
Help manage site content — posts, menus, locations, and more — with concise, action-oriented responses.

Site: ${siteName}
Current page: ${currentPage}

Capabilities (always use tools — never say you can't do something the tools support):
- Posts: list, create, publish
- Menus: create, rename, view items, add items, update items, publish menu
- Locations/branches: list, create, update (title, city, phone, address), rename
- Site: rename (brand name + internal name stay in sync)
- Slugs: updating a location title ALWAYS auto-updates its URL slug — just call update_location with the new title
- Stats: post counts, menu counts

Guidelines:
- Use tools to take real actions, not just describe what could be done
- After creating a post, always show the content and ask before publishing
- Before performing bulk operations (adding 5+ menu items at once), ALWAYS call confirm_bulk_operation first to get user confirmation
- Keep responses short — this is a chat panel, not a report
- When listing posts or menu items, show the most relevant 5
- Never tell the user a feature is unavailable if a tool exists for it`

  const agentMessages: AiMessage[] = body.messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
  }))

  const toolCalls: Array<{ name: string; input: any; result: any }> = []
  let totalInput = 0
  let totalOutput = 0
  let cfLogId: string | null = null
  let finalReply = ''

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let aiResponse
    try {
      aiResponse = await callAiGateway(env, agentMessages, {
        system: SYSTEM,
        tools: TOOLS,
        maxTokens: 1024,
        metadata: { org_id: orgId, site_id: siteId, action: 'sidekick' },
      })
    } catch (err: any) {
      console.error('[agent] callAiGateway error:', err?.message)
      return jsonResponse({ error: err?.message ?? 'AI generation failed. Please try again.' }, { status: 502 })
    }

    totalInput += aiResponse.usage.input_tokens
    totalOutput += aiResponse.usage.output_tokens
    cfLogId = aiResponse.cfLogId

    if (aiResponse.stop_reason === 'end_turn') {
      finalReply = aiResponse.content.find(b => b.type === 'text')?.text ?? ''
      break
    }

    if (aiResponse.stop_reason === 'tool_use') {
      agentMessages.push({ role: 'assistant', content: aiResponse.content })

      const results: any[] = []
      for (const block of aiResponse.content) {
        if (block.type !== 'tool_use') continue
        const result = await executeTool(block.name || '', block.input ?? {}, { db, orgId: orgId!, siteId: siteId!, userId: userId! })
        toolCalls.push({ name: block.name || '', input: block.input, result })
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }

      agentMessages.push({ role: 'user', content: results })
      continue
    }

    finalReply = aiResponse.content.find(b => b.type === 'text')?.text ?? ''
    break
  }

  await chargeCredits(db, orgId, {
    siteId,
    action: 'sidekick',
    model: MODEL,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cfGatewayLogId: cfLogId,
  })

  return jsonResponse({ success: true, reply: finalReply, toolCalls })
})

import type { H3Event } from 'h3'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { queryFirst } from '~/server/db'
import { aggregatePlatformAnalyticsForDate, getPlatformAnalyticsSummary } from '~/server/utils/analytics'
import { getPlatformMcpTool } from '~/server/utils/platform-mcp-tools'
import {
  createPlatformBlogPost,
  createPlatformDoc,
  deletePlatformBlogPost,
  deletePlatformDoc,
  getPlatformBlogPost,
  getPlatformDoc,
  listPlatformBlogPosts,
  listPlatformDocs,
  updatePlatformBlogPost,
  updatePlatformDoc,
} from '~/server/utils/platform-content'

function requiredString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} is required.`)
  }
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

function optionalNumber(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return typeof value === 'number' ? value : undefined
}

function optionalArray(args: Record<string, unknown>, key: string) {
  const value = args[key]
  return Array.isArray(value) ? value : undefined
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function optionalDateParam(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || dateString(parsed) !== value) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be a valid date in YYYY-MM-DD format.`)
  }
  return value
}

function structuredContentInput(args: Record<string, unknown>) {
  return {
    faq_items: optionalArray(args, 'faq_items') as Array<{ question: string; answer: string; position?: number }> | undefined,
    faq_label: optionalString(args, 'faq_label'),
    faq_status: optionalString(args, 'faq_status') as 'active' | 'inactive' | undefined,
    faq_render_enabled: optionalBoolean(args, 'faq_render_enabled'),
    faq_schema_enabled: optionalBoolean(args, 'faq_schema_enabled'),
    how_to_steps: optionalArray(args, 'how_to_steps') as Array<{ name: string; text: string; image_asset_id?: string; url?: string; position?: number }> | undefined,
    how_to_estimated_time: optionalString(args, 'how_to_estimated_time'),
    how_to_tool_items: optionalArray(args, 'how_to_tool_items') as string[] | undefined,
    how_to_supply_items: optionalArray(args, 'how_to_supply_items') as string[] | undefined,
    how_to_label: optionalString(args, 'how_to_label'),
    how_to_status: optionalString(args, 'how_to_status') as 'active' | 'inactive' | undefined,
    how_to_render_enabled: optionalBoolean(args, 'how_to_render_enabled'),
    how_to_schema_enabled: optionalBoolean(args, 'how_to_schema_enabled'),
    components: optionalArray(args, 'components') as Array<{
      type: 'faq' | 'how_to'
      position?: number
      label?: string
      status?: 'active' | 'inactive'
      render_enabled?: boolean
      schema_enabled?: boolean
      data: unknown
    }> | undefined,
  }
}

export async function executePlatformMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
) {
  const tool = getPlatformMcpTool(toolName)
  if (!tool) {
    throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unknown tool: ${toolName}`)
  }

  const user = await requireMcpUser(event, {
    // See scopes comment in server/utils/auth.ts: DCR-registered MCP clients
    // legitimately carry every custom scope by default, so forbiddenScopes
    // isn't used here — audiences (aud claim) + requirePlatformAdmin (DB role)
    // are the real boundary, matching server/api/mcp/platform.post.ts.
    audiences: [
      `${String(event.context.cloudflare?.env?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')}/api/mcp/platform`,
      'https://krabiclaw.com/api/mcp/platform',
    ],
    requiredScopes: ['platform_admin'],
    requirePlatformAdmin: true,
  })

  switch (toolName) {
    case 'get_platform_context': {
      const currentUser = await queryFirst<{ id: string; email: string | null; name: string | null; role: string | null }>(
        user.db,
        'SELECT id, email, name, role FROM user WHERE id = ? LIMIT 1',
        [user.userId],
      )
      if (!currentUser) throw mcpProtocolError(MCP_ERROR.internal, 'Current user not found.')
      return {
        currentUser: {
          ...currentUser,
          isPlatformAdmin: user.isPlatformAdmin,
        },
      }
    }
    case 'get_platform_analytics': {
      const endDate = optionalDateParam(rawArguments, 'end_date') ?? dateString(new Date())
      const startDate = optionalDateParam(rawArguments, 'start_date') ?? dateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      if (startDate > endDate) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, 'start_date must be before or equal to end_date.')
      }

      const today = dateString(new Date())
      if (endDate >= today) {
        await aggregatePlatformAnalyticsForDate(user.db, today)
      }

      const summary = await getPlatformAnalyticsSummary(user.db, startDate, endDate)
      return {
        page_views: summary.pageViews,
        unique_sessions: summary.uniqueSessions,
        unique_visitors: summary.uniqueVisitors,
        new_signups: summary.newSignups,
        top_pages: summary.topPages.map((page) => ({
          path: page.path,
          views: page.views,
          percent_of_total: page.percentOfTotal,
        })),
        daily_data: summary.dailyData.map((day) => ({
          date: day.date,
          page_views: day.pageViews,
          sessions: day.sessions,
          new_signups: day.newSignups,
        })),
        period: { start_date: startDate, end_date: endDate },
      }
    }
    case 'list_platform_blog_posts':
      return { posts: await listPlatformBlogPosts(user.db, optionalString(rawArguments, 'status')) }
    case 'get_platform_blog_post':
      return { post: await getPlatformBlogPost(user.db, requiredString(rawArguments, 'post_id')) }
    case 'create_platform_blog_post':
      return await createPlatformBlogPost(user.db, user.userId, {
        title: requiredString(rawArguments, 'title'),
        body: requiredString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt') ?? null,
        category: optionalString(rawArguments, 'category') ?? null,
        seo_description: optionalString(rawArguments, 'seo_description') ?? null,
        seo_keywords: optionalString(rawArguments, 'seo_keywords') ?? null,
        canonical_url: optionalString(rawArguments, 'canonical_url') ?? null,
        robots: optionalString(rawArguments, 'robots') ?? null,
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id') ?? null,
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish') ?? false,
      })
    case 'update_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), {
        title: optionalString(rawArguments, 'title'),
        body: optionalString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt'),
        category: optionalString(rawArguments, 'category'),
        seo_description: optionalString(rawArguments, 'seo_description'),
        seo_keywords: optionalString(rawArguments, 'seo_keywords'),
        canonical_url: optionalString(rawArguments, 'canonical_url'),
        robots: optionalString(rawArguments, 'robots'),
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id'),
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish'),
        unpublish: optionalBoolean(rawArguments, 'unpublish'),
      })
    case 'publish_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), { publish: true })
    case 'unpublish_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), { unpublish: true })
    case 'delete_platform_blog_post':
      return await deletePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'))
    case 'list_platform_docs':
      return { docs: await listPlatformDocs(user.db, optionalString(rawArguments, 'status')) }
    case 'get_platform_doc':
      return { doc: await getPlatformDoc(user.db, requiredString(rawArguments, 'doc_id')) }
    case 'create_platform_doc':
      return await createPlatformDoc(user.db, user.userId, {
        title: requiredString(rawArguments, 'title'),
        body: requiredString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt') ?? null,
        category: optionalString(rawArguments, 'category') ?? null,
        seo_description: optionalString(rawArguments, 'seo_description') ?? null,
        seo_keywords: optionalString(rawArguments, 'seo_keywords') ?? null,
        canonical_url: optionalString(rawArguments, 'canonical_url') ?? null,
        robots: optionalString(rawArguments, 'robots') ?? null,
        difficulty_level: optionalString(rawArguments, 'difficulty_level') ?? null,
        sort_order: optionalNumber(rawArguments, 'sort_order') ?? 0,
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id') ?? null,
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id') ?? null,
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish') ?? false,
      })
    case 'update_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), {
        title: optionalString(rawArguments, 'title'),
        body: optionalString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt'),
        category: optionalString(rawArguments, 'category'),
        seo_description: optionalString(rawArguments, 'seo_description'),
        seo_keywords: optionalString(rawArguments, 'seo_keywords'),
        canonical_url: optionalString(rawArguments, 'canonical_url'),
        robots: optionalString(rawArguments, 'robots'),
        difficulty_level: optionalString(rawArguments, 'difficulty_level'),
        sort_order: optionalNumber(rawArguments, 'sort_order'),
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id'),
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id'),
        ...structuredContentInput(rawArguments),
        publish: optionalBoolean(rawArguments, 'publish'),
        unpublish: optionalBoolean(rawArguments, 'unpublish'),
      })
    case 'publish_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), { publish: true })
    case 'unpublish_platform_doc':
      return await updatePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'), { unpublish: true })
    case 'delete_platform_doc':
      return await deletePlatformDoc(user.db, requiredString(rawArguments, 'doc_id'))
    default:
      throw mcpProtocolError(MCP_ERROR.methodNotFound, `Unknown tool: ${toolName}`)
  }
}

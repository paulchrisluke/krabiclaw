import type { H3Event } from 'h3'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { requireMcpUser } from '~/server/utils/mcp-auth'
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
    audiences: [
      `${String(event.context.cloudflare?.env?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')}/api/mcp/platform`,
      'https://krabiclaw.com/api/mcp/platform',
    ],
    requiredScopes: ['platform_admin'],
    forbiddenScopes: ['tenant'],
    requirePlatformAdmin: true,
  })

  switch (toolName) {
    case 'get_platform_context': {
      const currentUser = await user.db.prepare(
        'SELECT id, email, name, role FROM user WHERE id = ? LIMIT 1'
      ).bind(user.userId).first<{ id: string; email: string | null; name: string | null; role: string | null }>()
      if (!currentUser) throw mcpProtocolError(MCP_ERROR.internal, 'Current user not found.')
      return {
        currentUser: {
          ...currentUser,
          isPlatformAdmin: user.isPlatformAdmin,
        },
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
        publish: optionalBoolean(rawArguments, 'publish') ?? false,
      })
    case 'update_platform_blog_post':
      return await updatePlatformBlogPost(user.db, requiredString(rawArguments, 'post_id'), {
        title: optionalString(rawArguments, 'title'),
        body: optionalString(rawArguments, 'body'),
        excerpt: optionalString(rawArguments, 'excerpt'),
        category: optionalString(rawArguments, 'category'),
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
        difficulty_level: optionalString(rawArguments, 'difficulty_level') ?? null,
        sort_order: optionalNumber(rawArguments, 'sort_order') ?? 0,
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id') ?? null,
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id') ?? null,
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
        difficulty_level: optionalString(rawArguments, 'difficulty_level'),
        sort_order: optionalNumber(rawArguments, 'sort_order'),
        parent_doc_id: optionalString(rawArguments, 'parent_doc_id'),
        featured_image_asset_id: optionalString(rawArguments, 'featured_image_asset_id'),
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

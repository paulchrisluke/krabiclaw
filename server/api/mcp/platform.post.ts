import { createError, getHeader, setResponseHeader, type H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  asMcpError,
  mcpFailure,
  mcpSuccess,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  readMcpRequest,
} from '~/server/utils/mcp-protocol'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { executePlatformMcpToolCall } from '~/server/utils/platform-mcp-executor'
import { PLATFORM_MCP_TOOLS } from '~/server/utils/platform-mcp-tools'
import { PLATFORM_MCP_RESOURCES, readPlatformMcpResource } from '~/server/utils/platform-mcp-resources'
import { PLATFORM_MCP_PROMPTS, renderPlatformMcpPrompt } from '~/server/utils/platform-mcp-prompts'

function oauthChallenge(baseUrl: string, error = 'invalid_token', description = 'Connect the KrabiClaw platform admin app to continue.') {
  return `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/platform-mcp", error="${error}", error_description="${description}"`
}

function setMcpAuthChallenge(event: H3Event, challenge: string) {
  setResponseHeader(event, 'WWW-Authenticate', challenge)
}

function mcpAuthRequiredResult(challenge: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'Authentication required: connect the KrabiClaw platform admin app to continue.',
      },
    ],
    _meta: {
      'mcp/www_authenticate': [challenge],
    },
  }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
  const authChallenge = oauthChallenge(baseUrl)
  const platformAdminAuthOptions = {
    // aud claim, bound to the `resource` param ChatGPT sends at /authorize, is the
    // real per-surface boundary — see scopes comment in server/utils/auth.ts for
    // why DCR-registered clients carry every custom scope and forbiddenScopes
    // isn't used here.
    audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
    requiredScopes: ['platform_admin'],
    requirePlatformAdmin: true,
  }
  let requestId: string | number | null | undefined
  let requestMethod: string | undefined
  let requestToolName: string | undefined

  try {
    if (!getHeader(event, 'authorization')?.startsWith('Bearer ') && !getHeader(event, 'cookie')) {
      const body = await readBody(event)
      const rawBody = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
      requestId = rawBody?.id as string | number | undefined
      requestMethod = rawBody?.method as string | undefined
      requestToolName = rawBody?.params && typeof rawBody.params === 'object' && !Array.isArray(rawBody.params) && typeof (rawBody.params as Record<string, unknown>).name === 'string'
        ? String((rawBody.params as Record<string, unknown>).name)
        : undefined
      setResponseStatus(event, 401)
      setMcpAuthChallenge(event, authChallenge)
      if (requestMethod === 'tools/call') {
        return mcpSuccess(requestId ?? null, mcpAuthRequiredResult(authChallenge))
      }
      return mcpFailure(requestId ?? null, {
        code: MCP_ERROR.invalidRequest,
        message: 'Authentication required.',
      })
    }

    const body = await readBody(event)
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      setResponseStatus(event, 200)
      return ''
    }

    const request = readMcpRequest(event, body)
    requestId = request.id
    requestMethod = request.method
    requestToolName = request.method === 'tools/call' && typeof request.params?.name === 'string' ? request.params.name : undefined

    if (request.method === 'initialize') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' },
        instructions: [
          'KrabiClaw platform admin MCP. This app does not expose tenant site tools — it is for internal operations on krabiclaw.com/blog and krabiclaw.com/docs only.',
          'You are acting as a growth/SEO copilot for a human content writer, not an autonomous publisher. Your job is to help them prioritize, research, draft, edit, and publish platform blog posts and docs in service of growing krabiclaw.com traffic and sign-ups.',
          'Early in a session, read the kc://docs/product-context resource (PRODUCT.md) for what KrabiClaw actually is, its surfaces, verticals, and business model — do not assume or invent product facts.',
          'Derive voice and tone from existing published posts/docs (via list_platform_blog_posts, get_platform_blog_post, list_platform_docs, get_platform_doc) rather than inventing a style — KrabiClaw has no separate style guide; the published content is the style guide.',
          'Ground prioritization in get_platform_analytics (traffic and new_signups), not guesses about what readers want.',
          'Prefer the prompts audit_content_for_growth, draft_blog_post, and update_and_publish_post as starting points for those respective workflows.',
          'New content should be drafted for the writer\'s approval before publishing. Once the writer has supplied or approved final content, execute the corresponding tool calls directly and in sequence — do not stop to describe a call instead of making it.',
        ].join(' '),
      })
    }

    if (request.method === 'notifications/initialized') {
      setResponseStatus(event, 202)
      return ''
    }

    if (request.method === 'ping') {
      // Intentionally unauthenticated: MCP clients use ping as a liveness check before
      // the OAuth handshake completes, and it returns no information beyond {}.
      return mcpSuccess(request.id, {})
    }

    if (request.method === 'resources/list') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, { resources: PLATFORM_MCP_RESOURCES })
    }

    if (request.method === 'resources/read') {
      await requireMcpUser(event, platformAdminAuthOptions)
      const uri = typeof request.params?.uri === 'string' ? request.params.uri : ''
      const content = await readPlatformMcpResource(uri)
      return mcpSuccess(request.id, { contents: [content] })
    }

    if (request.method === 'resources/templates/list') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, { resourceTemplates: [] })
    }

    if (request.method === 'prompts/list') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, { prompts: PLATFORM_MCP_PROMPTS })
    }

    if (request.method === 'prompts/get') {
      await requireMcpUser(event, platformAdminAuthOptions)
      const name = typeof request.params?.name === 'string' ? request.params.name : ''
      const rawPromptArgs = request.params?.arguments
      const promptArgs: Record<string, string> = {}
      if (rawPromptArgs && typeof rawPromptArgs === 'object' && !Array.isArray(rawPromptArgs)) {
        for (const [key, value] of Object.entries(rawPromptArgs as Record<string, unknown>)) {
          if (typeof value === 'string') promptArgs[key] = value
        }
      }
      const rendered = renderPlatformMcpPrompt(name, promptArgs)
      return mcpSuccess(request.id, {
        description: rendered.description,
        messages: [
          { role: 'user', content: { type: 'text', text: rendered.text } },
        ],
      })
    }

    if (request.method === 'server/discover') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, {
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'],
        capabilities: { tools: {} },
        serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' },
        instructions: 'Internal KrabiClaw platform admin MCP for platform blog and docs operations only.',
      })
    }

    if (request.method === 'tools/list') {
      await requireMcpUser(event, platformAdminAuthOptions)
      return mcpSuccess(request.id, {
        tools: PLATFORM_MCP_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          securitySchemes: tool.securitySchemes,
          _meta: {
            securitySchemes: tool.securitySchemes,
            'krabiclaw/toolSurface': 'platform_admin',
          },
        })),
      })
    }

    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      const rawArgs =
        request.params?.arguments &&
        typeof request.params.arguments === 'object' &&
        !Array.isArray(request.params.arguments)
          ? request.params.arguments as Record<string, unknown>
          : Object.fromEntries(Object.entries(request.params ?? {}).filter(([key]) => key !== 'name'))

      const result = await executePlatformMcpToolCall(event, toolName, rawArgs)
      return mcpSuccess(request.id, {
        isError: false,
        structuredContent: result,
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
      })
    }

    throw createError({
      statusCode: 404,
      statusMessage: `Unsupported MCP method: ${request.method}`,
    })
  } catch (error) {
    const mcpError = asMcpError(error)
    const errorStatus =
      typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : null
    const status =
      errorStatus ??
      (mcpError.code === MCP_ERROR.methodNotFound
        ? 404
        : mcpError.code === MCP_ERROR.invalidRequest || mcpError.code === MCP_ERROR.invalidParams || mcpError.code === MCP_ERROR.parse
          ? 400
          : 500)
    setResponseStatus(event, status)
    if (status === 401) {
      setMcpAuthChallenge(event, authChallenge)
      if (requestMethod === 'tools/call') {
        return mcpSuccess(requestId, mcpAuthRequiredResult(authChallenge))
      }
    }
    console.error(
      '[PLATFORM_MCP]',
      status,
      mcpError.code,
      mcpError.message,
      'method:',
      requestMethod ?? null,
      'tool:',
      requestToolName ?? null,
      'request_id:',
      requestId ?? null,
    )
    return mcpFailure(requestId, mcpError)
  }
})

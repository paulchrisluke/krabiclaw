import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  asMcpError,
  mcpFailure,
  mcpSuccess,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  parseMcpToolCallArguments,
  readMcpRequest,
} from '~/server/utils/mcp-protocol'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { executePlatformMcpToolCall } from '~/server/utils/platform-mcp-executor'
import { PLATFORM_MCP_TOOLS } from '~/server/utils/platform-mcp-tools'
import { PLATFORM_MCP_RESOURCES, readPlatformMcpResource } from '~/server/utils/platform-mcp-resources'
import { PLATFORM_MCP_PROMPTS, renderPlatformMcpPrompt } from '~/server/utils/platform-mcp-prompts'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'
import {
  buildMcpAuthChallengeForError,
  buildMcpOAuthChallenge,
  describeMcpAuthTelemetryError,
  getCloudflareWaitUntil,
  isMcpMutatingTool,
  mcpAuthRequiredResult,
  setMcpAuthChallenge,
} from '~/server/utils/mcp-route-helpers'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { getPlatformHtmlCacheHosts } from '~/server/utils/tenant-hosts'
import { logMcpToolCallEvent } from '~/server/utils/mcp-telemetry'

const PLATFORM_AUTH_DESCRIPTION = 'Connect the KrabiClaw platform admin app to continue.'
const PLATFORM_AUTH_REQUIRED_TEXT = 'Authentication required: connect the KrabiClaw platform admin app to continue.'
const PLATFORM_MCP_TOOL_DOMAIN = 'platform_admin'
const PLATFORM_KNOWLEDGE_MUTATION_TOOLS = new Set([
  'create_platform_blog_post',
  'update_platform_blog_post',
  'publish_platform_blog_post',
  'unpublish_platform_blog_post',
  'delete_platform_blog_post',
  'create_platform_doc',
  'update_platform_doc',
  'publish_platform_doc',
  'unpublish_platform_doc',
  'delete_platform_doc',
])

function shouldUseLeanToolCatalog(event: H3Event) {
  const userAgent = (getHeader(event, 'user-agent') || '').toLowerCase()
  return userAgent.includes('openai-mcp/')
}

function resourceMetadataUrl(baseUrl: string) {
  return `${baseUrl}/.well-known/oauth-protected-resource/platform-mcp`
}

function summarizePayloadShape(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      type: Array.isArray(value) ? 'array' : typeof value,
    }
  }

  const keys = Object.keys(value as Record<string, unknown>)
  return {
    type: 'object',
    key_count: keys.length,
    keys: keys.slice(0, 20),
  }
}

function logPlatformMcpEventDetached(
  event: Parameters<typeof getCloudflareWaitUntil>[0],
  db: D1Database | undefined,
  input: Parameters<typeof logMcpToolCallEvent>[1],
) {
  if (!db) return
  const logPromise = logMcpToolCallEvent(db, {
    ...input,
    mcpSurface: 'platform',
  })
  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) waitUntil(logPromise)
  else logPromise.catch(() => {})
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
  const authChallenge = buildMcpOAuthChallenge({
    resourceMetadataUrl: resourceMetadataUrl(baseUrl),
    description: PLATFORM_AUTH_DESCRIPTION,
  })
  const platformAdminAuthOptions = {
    // aud claim, bound to the `resource` param ChatGPT sends at /authorize, is the
    // real per-surface boundary, so forbiddenScopes isn't used here.
    audiences: [`${baseUrl}/api/mcp/platform`],
    requiredScopes: ['platform_admin'],
    requirePlatformAdmin: true,
  }
  let requestId: string | number | null | undefined
  let requestMethod: string | undefined
  let requestToolName: string | undefined
  let requestToolArgs: Record<string, unknown> | undefined

  try {
    if (!getHeader(event, 'authorization')?.startsWith('Bearer ') && !getHeader(event, 'cookie')) {
      const body = await readBody(event)
      const rawBody = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
      requestId = rawBody?.id as string | number | undefined
      requestMethod = rawBody?.method as string | undefined
      requestToolName = rawBody?.params && typeof rawBody.params === 'object' && !Array.isArray(rawBody.params) && typeof (rawBody.params as Record<string, unknown>).name === 'string'
        ? String((rawBody.params as Record<string, unknown>).name)
        : undefined
      if (requestMethod === 'tools/call') {
        logPlatformMcpEventDetached(event, env.DB, {
          requestId: requestId ?? null,
          method: requestMethod,
          toolName: requestToolName ?? null,
          toolDomain: requestToolName ? PLATFORM_MCP_TOOL_DOMAIN : null,
          status: 'auth_required',
          errorMessage: 'credential_missing: missing bearer token or cookie',
        })
        return mcpSuccess(requestId ?? null, mcpAuthRequiredResult({ challenge: authChallenge, message: PLATFORM_AUTH_REQUIRED_TEXT }))
      }
      setResponseStatus(event, 401)
      setMcpAuthChallenge(event, authChallenge)
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
          'KrabiClaw platform admin MCP. This app does not expose tenant site tools — it is for internal platform content operations and read-only release data.',
          'You are acting as a growth/SEO copilot for a human content writer, not an autonomous publisher. Your job is to help them prioritize, research, draft, edit, and publish platform blog posts and docs in service of growing krabiclaw.com traffic and sign-ups.',
          'Early in a session, read the kc://docs/product-context resource (PRODUCT.md) for what KrabiClaw actually is, its surfaces, verticals, and business model — do not assume or invent product facts.',
          'Derive voice and tone from existing published posts/docs (via list_platform_blog_posts, get_platform_blog_post, list_platform_docs, get_platform_doc) rather than inventing a style — KrabiClaw has no separate style guide; the published content is the style guide.',
          'Ground prioritization in get_platform_analytics (traffic and new_signups), not guesses about what readers want.',
          'Use get_recent_changes when the writer needs categorized merged-pull-request source data for release notes, social posts, or product updates. Treat it as source material for human-reviewed drafts; it does not publish or send anything.',
          'If the writer wants a featured image or step image, use list_platform_media_assets to choose an existing asset or upload_platform_image with a real ChatGPT attachment. Do not suggest or rely on generated images for this surface.',
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
        instructions: 'Internal KrabiClaw platform admin MCP for platform blog/docs operations and read-only release data.',
      })
    }

    if (request.method === 'tools/list') {
      await requireMcpUser(event, platformAdminAuthOptions)
      const leanToolCatalog = shouldUseLeanToolCatalog(event)
      return mcpSuccess(request.id, {
        tools: PLATFORM_MCP_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(leanToolCatalog
            ? {}
            : {
                outputSchema: tool.outputSchema,
                annotations: tool.annotations,
                securitySchemes: tool.securitySchemes,
              }),
          _meta: {
            securitySchemes: tool.securitySchemes,
            'krabiclaw/toolSurface': 'platform_admin',
            ...(tool.fileParams?.length ? { 'openai/fileParams': tool.fileParams } : {}),
          },
        })),
      })
    }

    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      const toolStart = Date.now()
      const rawArgs = parseMcpToolCallArguments(request.params)
      requestToolArgs = rawArgs

      let result: unknown
      try {
        result = await executePlatformMcpToolCall(event, toolName, rawArgs)
      } catch (toolError) {
        const mcpErr = asMcpError(toolError)
        if (mcpErr.code === MCP_ERROR.invalidParams) {
          logPlatformMcpEventDetached(event, env.DB, {
            requestId: request.id,
            method: request.method,
            toolName,
            toolDomain: PLATFORM_MCP_TOOL_DOMAIN,
            isMutating: isMcpMutatingTool(PLATFORM_MCP_TOOLS.find(t => t.name === toolName)),
            arguments: summarizePayloadShape(rawArgs),
            status: 'error',
            errorCode: mcpErr.code,
            errorMessage: mcpErr.message,
            durationMs: Date.now() - toolStart,
          })
          return mcpSuccess(request.id, {
            isError: true,
            content: [{ type: 'text', text: mcpErr.message }],
          })
        }
        throw toolError
      }

      // After any mutating tool call, purge KV HTML cache for every platform
      // hostname before returning. Platform blog/docs edits are tiny admin
      // writes, and returning before this finishes lets an immediate browser
      // load reuse stale /blog HTML while the slug page renders fresh.
      const mutatedTool = PLATFORM_MCP_TOOLS.find(tool => tool.name === toolName)
      if (isMcpMutatingTool(mutatedTool)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (env as any).SITE_CACHE as KVNamespace | undefined
        if (kv) {
          try {
            await purgeSiteKvCache(kv, getPlatformHtmlCacheHosts(env, [baseUrl]))
          } catch (err: unknown) {
            console.warn('[platform-mcp-cache-purge] failed:', String(err))
          }
        }
      }
      if (PLATFORM_KNOWLEDGE_MUTATION_TOOLS.has(toolName) && env.db) {
        schedulePlatformKnowledgeIndexRebuild(event, env, `platform MCP ${toolName}`, env.db)
      }

      logPlatformMcpEventDetached(event, env.DB, {
        requestId: request.id,
        method: request.method,
        toolName,
        toolDomain: PLATFORM_MCP_TOOL_DOMAIN,
        isMutating: isMcpMutatingTool(mutatedTool),
        arguments: summarizePayloadShape(rawArgs),
        result: summarizePayloadShape(result),
        status: 'success',
        durationMs: Date.now() - toolStart,
      })

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
    if (requestMethod === 'tools/call') {
      logPlatformMcpEventDetached(event, env.DB, {
        requestId: requestId ?? null,
        method: requestMethod,
        toolName: requestToolName ?? null,
        toolDomain: requestToolName ? PLATFORM_MCP_TOOL_DOMAIN : null,
        isMutating: isMcpMutatingTool(PLATFORM_MCP_TOOLS.find((t) => t.name === requestToolName)),
        arguments: requestToolArgs ? summarizePayloadShape(requestToolArgs) : undefined,
        status: error instanceof Error && /Authentication required/i.test(error.message) ? 'auth_required' : 'error',
        errorCode: asMcpError(error).code,
        errorMessage: error instanceof Error && /Authentication required/i.test(error.message)
          ? describeMcpAuthTelemetryError(error)
          : error instanceof Error ? error.message : String(error),
      })
    }
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
    if (status === 401) {
      const authChallengeForFailure = buildMcpAuthChallengeForError(error, {
        resourceMetadataUrl: resourceMetadataUrl(baseUrl),
        defaultDescription: PLATFORM_AUTH_DESCRIPTION,
      })
      if (requestMethod === 'tools/call') {
        return mcpSuccess(requestId, mcpAuthRequiredResult({ challenge: authChallengeForFailure, message: PLATFORM_AUTH_REQUIRED_TEXT }))
      }
      setResponseStatus(event, 401)
      setMcpAuthChallenge(event, authChallengeForFailure)
      return mcpFailure(requestId, mcpError)
    }
    setResponseStatus(event, status)
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

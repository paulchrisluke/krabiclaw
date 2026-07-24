import { getHeader, setResponseStatus } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  asMcpError,
  mcpSuccess,
  MCP_ERROR,
  negotiatedMcpProtocolVersion,
  parseMcpToolCallArguments,
  readMcpRequest,
} from '~/server/utils/mcp-protocol'
import { catalogFingerprint, catalogMeta } from '~/server/utils/mcp-catalog'
import { mcpHttpStatusForError, sendMcpErrorResponse } from '~/server/utils/mcp-http-response'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { executePlatformMcpToolCall } from '~/server/utils/platform-mcp-executor'
import { PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '~/server/utils/platform-mcp-tools'
import { PLATFORM_MCP_RESOURCES, readPlatformMcpResource } from '~/server/utils/platform-mcp-resources'
import { PLATFORM_MCP_PROMPTS, renderPlatformMcpPrompt } from '~/server/utils/platform-mcp-prompts'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'
import {
  dispatchStandardMcpMethod,
  respondToMcpError,
  resolveMissingMcpCredential,
  unsupportedMcpMethodError,
  type McpToolMeta,
} from '~/server/utils/mcp-runtime'
import { getCloudflareWaitUntil, isMcpMutatingTool } from '~/server/utils/mcp-route-helpers'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { getPlatformHtmlCacheHosts } from '~/server/utils/tenant-hosts'
import { logMcpToolCallEvent } from '~/server/utils/mcp-telemetry'

const PLATFORM_AUTH_DESCRIPTION = 'Connect the KrabiClaw platform admin app to continue.'
const PLATFORM_AUTH_REQUIRED_TEXT = 'Authentication required: connect the KrabiClaw platform admin app to continue.'
const PLATFORM_MCP_TOOL_DOMAIN = 'platform_admin'
const PLATFORM_KNOWLEDGE_MUTATION_TOOLS = new Set([
  'create_platform_blog_post',
  'update_platform_blog_post',
  'update_platform_blog_metadata',
  'replace_platform_blog_content',
  'publish_platform_blog_post',
  'unpublish_platform_blog_post',
  'delete_platform_blog_post',
  'create_platform_doc',
  'update_platform_doc',
  'publish_platform_doc',
  'unpublish_platform_doc',
  'delete_platform_doc',
  'append_content_block',
  'replace_content_block',
  'delete_content_block',
  'publish_content_revision',
])
const PLATFORM_CATALOG_FINGERPRINT = catalogFingerprint(PLATFORM_PUBLIC_MCP_TOOLS)

function resourceMetadataUrl(baseUrl: string) {
  return `${baseUrl}/.well-known/oauth-protected-resource/platform-mcp`
}

function resolvePlatformToolMeta(toolName: string | null): McpToolMeta {
  const tool = toolName ? PLATFORM_MCP_TOOLS.find(t => t.name === toolName) : undefined
  return { domain: toolName ? PLATFORM_MCP_TOOL_DOMAIN : null, isMutating: isMcpMutatingTool(tool) }
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
  const env = cloudflareEnv(event)
  const logPromise = logMcpToolCallEvent(db, {
    env,
    ...input,
    mcpSurface: 'platform',
    userAgent: input.userAgent ?? getHeader(event, 'user-agent') ?? null,
    cfRayId: input.cfRayId ?? getHeader(event, 'cf-ray') ?? null,
    sessionId: input.sessionId ?? getHeader(event, 'mcp-session-id') ?? null,
    deploymentVersion: input.deploymentVersion
      ?? String(env.DEPLOYMENT_VERSION ?? env.CF_PAGES_COMMIT_SHA ?? env.GITHUB_SHA ?? 'unknown'),
    catalogFingerprint: input.catalogFingerprint ?? PLATFORM_CATALOG_FINGERPRINT,
  })
  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) waitUntil(logPromise)
  else logPromise.catch(() => {})
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
  const platformAdminAuthOptions = {
    // aud claim, bound to the `resource` param ChatGPT sends at /authorize, is the
    // real per-surface boundary, so forbiddenScopes isn't used here.
    audiences: [`${baseUrl}/api/mcp/platform`],
    requiredScopes: ['platform_admin'],
    requirePlatformAdmin: true,
  }
  const runtimeDeps = {
    authOptions: platformAdminAuthOptions,
    resourceMetadataUrl,
    authDescription: PLATFORM_AUTH_DESCRIPTION,
    authRequiredText: PLATFORM_AUTH_REQUIRED_TEXT,
    logEvent: (evt: typeof event, fields: Record<string, unknown>) =>
      logPlatformMcpEventDetached(evt, env.DB, fields as unknown as Parameters<typeof logMcpToolCallEvent>[1]),
    resolveToolMeta: resolvePlatformToolMeta,
  }
  let requestId: string | number | null | undefined
  let requestMethod: string | undefined
  let requestToolName: string | undefined
  let requestToolArgs: Record<string, unknown> | undefined

  try {
    const missingCredential = await resolveMissingMcpCredential(event, runtimeDeps, baseUrl)
    if (missingCredential.handled) {
      requestId = missingCredential.requestId
      requestMethod = missingCredential.requestMethod
      requestToolName = missingCredential.requestToolName
      return missingCredential.response
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
      const user = await requireMcpUser(event, platformAdminAuthOptions)
      const protocolVersion = negotiatedMcpProtocolVersion(request)
      logPlatformMcpEventDetached(event, env.DB, {
        userId: user.userId,
        requestId: request.id,
        method: request.method,
        status: 'success',
        httpStatus: 200,
        protocolVersion,
        oauthClientId: user.oauthClientId ?? null,
      })
      return mcpSuccess(request.id, {
        protocolVersion,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' },
        _meta: catalogMeta(PLATFORM_PUBLIC_MCP_TOOLS),
        instructions: [
          'KrabiClaw platform admin MCP. This app does not expose tenant site tools — it is for internal platform content operations and read-only release data.',
          'You are acting as a growth/SEO copilot for a human content writer, not an autonomous publisher. Your job is to help them prioritize, research, draft, edit, and publish platform blog posts and docs in service of growing krabiclaw.com traffic and sign-ups.',
          'Early in a session, read the kc://docs/product-context resource (PRODUCT.md) for what KrabiClaw actually is, its surfaces, verticals, and business model — do not assume or invent product facts.',
          'Derive voice and tone from existing published posts/docs (via list_platform_blog_posts, get_platform_blog_post, list_platform_docs, get_platform_doc) rather than inventing a style — KrabiClaw has no separate style guide; the published content is the style guide.',
          'Ground prioritization in get_platform_analytics (traffic and new_signups), not guesses about what readers want.',
          'Use get_recent_changes when the writer needs categorized merged-pull-request source data for release notes, social posts, or product updates. Treat it as source material for human-reviewed drafts; it does not publish or send anything.',
          'Before drafting or materially rewriting a platform blog post, call resolve_platform_agent_guidance({ task: "blog.write" }) and review_platform_agent_guidance_candidate({ task: "blog.write", candidate_type: "blog_draft", candidate: <exact draft> }). For tenant-targeted platform support, pass site_id so the scope is explicit.',
          'For image-generation requests, call resolve_platform_agent_guidance({ task: "image.generate" }) and review_platform_agent_guidance_candidate({ task: "image.generate", candidate_type: "image_brief", candidate: <exact brief> }) before using native image_generation. Do not treat a generated image as stored platform media unless a platform media save tool exists for that flow.',
          'If the writer wants to use an existing or attached featured/step image, use list_platform_media_assets to choose an existing asset or upload_platform_image with a real ChatGPT attachment.',
          'Prefer the prompts audit_content_for_growth, draft_blog_post, and update_and_publish_post as starting points for those respective workflows.',
          'New content should be drafted for the writer\'s approval before publishing. Once the writer has supplied or approved final content, execute the corresponding tool calls directly and in sequence — do not stop to describe a call instead of making it.',
        ].join(' '),
      })
    }

    const standardResponse = await dispatchStandardMcpMethod(event, request, runtimeDeps, {
      resources: { list: PLATFORM_MCP_RESOURCES, read: (uri: string) => readPlatformMcpResource(uri) },
      prompts: { list: PLATFORM_MCP_PROMPTS, render: renderPlatformMcpPrompt },
      discover: {
        serverName: 'krabiclaw-platform-mcp',
        serverVersion: 'v1',
        instructions: 'Internal KrabiClaw platform admin MCP for platform blog/docs operations and read-only release data.',
      },
    })
    if (standardResponse !== undefined) return standardResponse

    if (request.method === 'tools/list') {
      const user = await requireMcpUser(event, platformAdminAuthOptions)
      const tools = PLATFORM_PUBLIC_MCP_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          securitySchemes: tool.securitySchemes,
          _meta: {
            securitySchemes: tool.securitySchemes,
            'krabiclaw/toolSurface': 'platform_admin',
            ...(tool.fileParams?.length ? { 'openai/fileParams': tool.fileParams } : {}),
          },
        }))
      logPlatformMcpEventDetached(event, env.DB, {
        userId: user.userId,
        requestId: request.id,
        method: request.method,
        result: { count: tools.length },
        status: 'success',
        httpStatus: 200,
        oauthClientId: user.oauthClientId ?? null,
      })
      return mcpSuccess(request.id, {
        tools,
        _meta: catalogMeta(PLATFORM_PUBLIC_MCP_TOOLS),
      })
    }

    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      const toolStart = Date.now()
      const rawArgs = parseMcpToolCallArguments(request.params)
      requestToolArgs = rawArgs
      const callUser = await requireMcpUser(event, platformAdminAuthOptions)

      let result: unknown
      try {
        result = await executePlatformMcpToolCall(event, toolName, rawArgs)
      } catch (toolError) {
        const mcpErr = asMcpError(toolError)
        if (mcpErr.kind === 'protocol') {
          logPlatformMcpEventDetached(event, env.DB, {
            userId: callUser.userId,
            requestId: request.id,
            method: request.method,
            toolName,
            toolDomain: PLATFORM_MCP_TOOL_DOMAIN,
            isMutating: false,
            arguments: summarizePayloadShape(rawArgs),
            status: 'error',
            errorCode: mcpErr.code,
            errorMessage: mcpErr.message,
            httpStatus: 200,
            jsonrpcErrorCode: mcpErr.code,
            jsonrpcErrorMessage: mcpErr.message,
            unknownToolName: toolName || null,
            oauthClientId: callUser.oauthClientId ?? null,
            durationMs: Date.now() - toolStart,
          })
          return sendMcpErrorResponse(event, { id: request.id, error: mcpErr })
        }
        if (mcpErr.code === MCP_ERROR.invalidParams) {
          logPlatformMcpEventDetached(event, env.DB, {
            userId: callUser.userId,
            requestId: request.id,
            method: request.method,
            toolName,
            toolDomain: PLATFORM_MCP_TOOL_DOMAIN,
            isMutating: isMcpMutatingTool(PLATFORM_MCP_TOOLS.find(t => t.name === toolName)),
            arguments: summarizePayloadShape(rawArgs),
            status: 'error',
            errorCode: mcpErr.code,
            errorMessage: mcpErr.message,
            httpStatus: 200,
            oauthClientId: callUser.oauthClientId ?? null,
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
        userId: callUser.userId,
        requestId: request.id,
        method: request.method,
        toolName,
        toolDomain: PLATFORM_MCP_TOOL_DOMAIN,
        isMutating: isMcpMutatingTool(mutatedTool),
        arguments: summarizePayloadShape(rawArgs),
        result: summarizePayloadShape(result),
        status: 'success',
        httpStatus: 200,
        oauthClientId: callUser.oauthClientId ?? null,
        compatibilityAliasUsed: toolName === 'update_platform_blog_post',
        compatibilityToolName: toolName === 'update_platform_blog_post' ? toolName : null,
        replacementToolNames: toolName === 'update_platform_blog_post'
          ? ['update_platform_blog_metadata', 'replace_platform_blog_content']
          : null,
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

    throw unsupportedMcpMethodError(request.method)
  } catch (error) {
    const mcpError = asMcpError(error)
    const toolCallPermissionError = requestMethod === 'tools/call' && mcpError.kind === 'forbidden'
    const mappedStatus = toolCallPermissionError ? 200 : mcpHttpStatusForError(mcpError)
    if (!toolCallPermissionError && mcpError.kind !== 'auth') {
      console.error(
        '[PLATFORM_MCP]',
        mappedStatus,
        mcpError.code,
        mcpError.message,
        'method:',
        requestMethod ?? null,
        'tool:',
        requestToolName ?? null,
        'request_id:',
        requestId ?? null,
      )
    }
    return respondToMcpError(event, error, {
      requestId,
      requestMethod,
      requestToolName,
      requestToolArgs,
      baseUrl,
      ...runtimeDeps,
    })
  }
})

import { HTTPError, defineHandler  } from 'nitro';
import {  readBody  } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  asMcpError, mcpSuccess, negotiatedMcpProtocolVersion, parseMcpToolCallArguments, readMcpRequest, } from '~/server/utils/mcp-protocol'
import { catalogFingerprint, catalogMeta } from '~/server/utils/mcp-catalog'
import { mcpHttpStatusForError, sendMcpErrorResponse } from '~/server/utils/mcp-http-response'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { executePlatformMcpToolCall } from '~/server/utils/platform-mcp-executor'
import { PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '~/server/utils/platform-mcp-tools'
import { PLATFORM_MCP_RESOURCES, readPlatformMcpResource } from '~/server/utils/platform-mcp-resources'
import { PLATFORM_MCP_PROMPTS, renderPlatformMcpPrompt } from '~/server/utils/platform-mcp-prompts'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'
import {
  dispatchStandardMcpMethod, respondToMcpError, resolveMissingMcpCredential, unsupportedMcpMethodError, type McpToolMeta, } from '~/server/utils/mcp-runtime'
import { getCloudflareWaitUntil, isMcpMutatingTool } from '~/server/utils/mcp-route-helpers'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { getPlatformHtmlCacheHosts } from '~/server/utils/tenant-hosts'
import { logMcpToolCallEvent } from '~/server/utils/mcp-telemetry'

const PLATFORM_AUTH_DESCRIPTION = 'Connect the KrabiClaw platform admin app to continue.'
const PLATFORM_AUTH_REQUIRED_TEXT = 'Authentication required: connect the KrabiClaw platform admin app to continue.'
const PLATFORM_MCP_TOOL_DOMAIN = 'platform_admin'
const PLATFORM_KNOWLEDGE_MUTATION_TOOLS = new Set([
  'create_platform_blog_post', 'update_platform_blog_metadata', 'replace_platform_blog_content', 'publish_platform_blog_post', 'delete_platform_blog_post', 'create_platform_doc', 'update_platform_doc', 'delete_platform_doc', 'append_content_block', 'replace_content_block', 'delete_content_block', ])
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
      type: Array.isArray(value) ? 'array' : typeof value, }
  }

  const keys = Object.keys(value as Record<string, unknown>)
  return {
    type: 'object', key_count: keys.length, keys: keys.slice(0, 20), }
}

function logPlatformMcpEventDetached(
  event: Parameters<typeof getCloudflareWaitUntil>[0], db: D1Database | undefined, input: Parameters<typeof logMcpToolCallEvent>[1], ) {
  if (!db) return
  const env = cloudflareEnv(event)
  const logPromise = logMcpToolCallEvent(db, {
    env, ...input, mcpSurface: 'platform', userAgent: input.userAgent ?? (event.req.headers.get('user-agent')) ?? null, cfRayId: input.cfRayId ?? (event.req.headers.get('cf-ray')) ?? null, sessionId: input.sessionId ?? (event.req.headers.get('mcp-session-id')) ?? null, catalogFingerprint: input.catalogFingerprint ?? PLATFORM_CATALOG_FINGERPRINT, })
  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) waitUntil(logPromise)
  else void logPromise.catch(error => console.error('Failed to persist platform MCP telemetry:', error))
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = env.BETTER_AUTH_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new HTTPError({ statusCode: 500, statusMessage: 'BETTER_AUTH_URL is required' })
  const platformAdminAuthOptions = {
    // aud claim, bound to the `resource` param ChatGPT sends at /authorize, is the
    // real per-surface boundary, so forbiddenScopes isn't used here.
    audiences: [`${baseUrl}/api/mcp/platform`], requiredScopes: ['platform_admin'], requirePlatformAdmin: true, }
  const runtimeDeps = {
    authOptions: platformAdminAuthOptions, resourceMetadataUrl, authDescription: PLATFORM_AUTH_DESCRIPTION, authRequiredText: PLATFORM_AUTH_REQUIRED_TEXT, logEvent: (evt: typeof event, fields: Record<string, unknown>) =>
      logPlatformMcpEventDetached(evt, env.DB, fields as unknown as Parameters<typeof logMcpToolCallEvent>[1]), resolveToolMeta: resolvePlatformToolMeta, }
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
    const request = readMcpRequest(event, body)
    requestId = request.id
    requestMethod = request.method
    requestToolName = request.method === 'tools/call' && typeof request.params?.name === 'string' ? request.params.name : undefined

    if (request.method === 'initialize') {
      const user = await requireMcpUser(event, platformAdminAuthOptions)
      const protocolVersion = negotiatedMcpProtocolVersion(request)
      logPlatformMcpEventDetached(event, env.DB, {
        userId: user.userId, requestId: request.id, method: request.method, status: 'success', httpStatus: 200, protocolVersion, oauthClientId: user.oauthClientId ?? null, })
      return mcpSuccess(request.id, {
        protocolVersion, capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' }, _meta: catalogMeta(PLATFORM_PUBLIC_MCP_TOOLS), instructions: [
          'KrabiClaw platform admin MCP. This app is for internal platform content operations and read-only release data.', 'Act as a growth and SEO copilot for a human content writer. Compose and review complete content in conversation before any write.', 'Read kc://docs/product-context before making product claims.', 'Derive voice and tone from existing published posts and docs.', 'Ground prioritization in get_platform_analytics.', 'Use get_recent_changes as source material for human-reviewed content; it does not publish anything.', 'Before composing or materially rewriting a platform blog article, call resolve_platform_agent_guidance({ task: "blog.write" }) and review_platform_agent_guidance_candidate({ task: "blog.write", candidate_type: "blog_article", candidate: <exact approved article> }).', 'For image generation, review an image_brief before using native image_generation.', 'Use real ChatGPT attachments with upload_platform_image when the writer supplies media.', 'Persist only approved final content. New blog articles publish immediately unless scheduled_for is provided; platform docs are public as soon as they are created.', ].join(' '), })
    }

    const standardResponse = await dispatchStandardMcpMethod(event, request, runtimeDeps, {
      resources: { list: PLATFORM_MCP_RESOURCES, read: (uri: string) => readPlatformMcpResource(uri) }, prompts: { list: PLATFORM_MCP_PROMPTS, render: renderPlatformMcpPrompt }, discover: {
        serverName: 'krabiclaw-platform-mcp', serverVersion: 'v1', instructions: 'Internal KrabiClaw platform admin MCP for platform blog/docs operations and read-only release data.', }, })
    if (standardResponse !== undefined) return standardResponse

    if (request.method === 'tools/list') {
      const user = await requireMcpUser(event, platformAdminAuthOptions)
      const tools = PLATFORM_PUBLIC_MCP_TOOLS.map(tool => ({
          name: tool.name, description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, annotations: tool.annotations, securitySchemes: tool.securitySchemes, _meta: {
            securitySchemes: tool.securitySchemes, 'krabiclaw/toolSurface': 'platform_admin', ...(tool.fileParams?.length ? { 'openai/fileParams': tool.fileParams } : {}), }, }))
      logPlatformMcpEventDetached(event, env.DB, {
        userId: user.userId, requestId: request.id, method: request.method, result: { count: tools.length }, status: 'success', httpStatus: 200, oauthClientId: user.oauthClientId ?? null, })
      return mcpSuccess(request.id, {
        tools, _meta: catalogMeta(PLATFORM_PUBLIC_MCP_TOOLS), })
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
            userId: callUser.userId, requestId: request.id, method: request.method, toolName, toolDomain: PLATFORM_MCP_TOOL_DOMAIN, isMutating: false, arguments: summarizePayloadShape(rawArgs), status: 'error', errorCode: mcpErr.code, errorMessage: mcpErr.message, httpStatus: 200, jsonrpcErrorCode: mcpErr.code, jsonrpcErrorMessage: mcpErr.message, unknownToolName: toolName || null, oauthClientId: callUser.oauthClientId ?? null, durationMs: Date.now() - toolStart, })
          return sendMcpErrorResponse(event, { id: request.id, error: mcpErr })
        }
        // Any other tool-execution failure (including a plain `throw new
        // Error(...)` from a business-rule guard, which asMcpError falls
        // back to classifying as kind:'transport') must still resolve as a
        // graceful isError:true 200, not a raw HTTP 500 — MCP clients can't
        // act on a transport-level error mid-tool-call any more than they
        // can act on a raw 401 (see resolveMissingMcpCredential). Confirmed
        // Tool business-rule failures must stay inside the MCP error envelope.
        logPlatformMcpEventDetached(event, env.DB, {
          userId: callUser.userId, requestId: request.id, method: request.method, toolName, toolDomain: PLATFORM_MCP_TOOL_DOMAIN, isMutating: isMcpMutatingTool(PLATFORM_MCP_TOOLS.find(t => t.name === toolName)), arguments: summarizePayloadShape(rawArgs), status: 'error', errorCode: mcpErr.code, errorMessage: mcpErr.message, httpStatus: 200, oauthClientId: callUser.oauthClientId ?? null, durationMs: Date.now() - toolStart, })
        return mcpSuccess(request.id, {
          isError: true, content: [{ type: 'text', text: mcpErr.message }], })
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
        userId: callUser.userId, requestId: request.id, method: request.method, toolName, toolDomain: PLATFORM_MCP_TOOL_DOMAIN, isMutating: isMcpMutatingTool(mutatedTool), arguments: summarizePayloadShape(rawArgs), result: summarizePayloadShape(result), status: 'success', httpStatus: 200, oauthClientId: callUser.oauthClientId ?? null, durationMs: Date.now() - toolStart, })

      return mcpSuccess(request.id, {
        isError: false, structuredContent: result, content: [
          { type: 'text', text: JSON.stringify(result, null, 2) }, ], })
    }

    throw unsupportedMcpMethodError(request.method)
  } catch (error) {
    const mcpError = asMcpError(error)
    const toolCallPermissionError = requestMethod === 'tools/call' && mcpError.kind === 'forbidden'
    const mappedStatus = toolCallPermissionError ? 200 : mcpHttpStatusForError(mcpError)
    if (!toolCallPermissionError && mcpError.kind !== 'auth') {
      console.error(
        '[PLATFORM_MCP]', mappedStatus, mcpError.code, mcpError.message, 'method:', requestMethod ?? null, 'tool:', requestToolName ?? null, 'request_id:', requestId ?? null, )
    }
    return respondToMcpError(event, error, {
      requestId, requestMethod, requestToolName, requestToolArgs, baseUrl, ...runtimeDeps, })
  }
})

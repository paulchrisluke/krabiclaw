import { createError, getHeader, setResponseHeader } from 'h3'
import { asMcpError, mcpFailure, mcpSuccess, MCP_ERROR, MCP_PROTOCOL_VERSION, protocolCache, readMcpRequest } from '~/server/utils/mcp-protocol'
import { executeMcpToolCall } from '~/server/utils/mcp-executor'
import { getActiveEntitlements, getVisibleSiteContext, requireMcpUser, roleSatisfies } from '~/server/utils/mcp-auth'
import { MCP_TOOLS } from '~/server/utils/mcp-tools'

export default defineEventHandler(async (event) => {
  let requestId: string | number | null | undefined
  try {
    // Return 401 with WWW-Authenticate before any protocol parsing so OAuth
    // clients (e.g. ChatGPT) can discover the authorization server on first touch.
    // Session-cookie requests (dashboard, E2E tests) have a Cookie header and skip this.
    if (!getHeader(event, 'authorization')?.startsWith('Bearer ') && !getHeader(event, 'cookie')) {
      const cfEnv = event.context.cloudflare?.env as { BETTER_AUTH_URL?: string } | undefined
      const baseUrl = (cfEnv?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
      setResponseStatus(event, 401)
      setResponseHeader(event, 'WWW-Authenticate',
        `Bearer realm="${baseUrl}/api/mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`)
      return mcpFailure(null, { code: MCP_ERROR.invalidRequest, message: 'Authentication required.' })
    }

    const body = await readBody(event)

    // ChatGPT occasionally sends an empty-body health probe — ignore silently.
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      setResponseStatus(event, 200)
      return ''
    }

    const request = readMcpRequest(event, body)
    requestId = request.id

    // MCP protocol handshake — required before any tools/list or tools/call
    if (request.method === 'initialize') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'krabiclaw-mcp', version: 'phase-5' },
        instructions: 'Stateless tools-only MCP server for KrabiClaw tenant operations.',
      })
    }

    // Client acknowledgement after initialize — spec requires 202 with no body
    if (request.method === 'notifications/initialized') {
      setResponseStatus(event, 202)
      return ''
    }

    // Standard ping
    if (request.method === 'ping') {
      return mcpSuccess(request.id, {})
    }

    // Resources and prompts — we are tools-only; return empty lists rather than 404
    if (request.method === 'resources/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, { resources: [] })
    }

    if (request.method === 'resources/templates/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, { resourceTemplates: [] })
    }

    if (request.method === 'prompts/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, { prompts: [] })
    }

    if (request.method === 'server/discover') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, protocolCache('server/discover', {
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'],
        capabilities: { tools: {} },
        serverInfo: {
          name: 'krabiclaw-mcp',
          version: 'phase-5',
        },
        instructions: 'Stateless tools-only MCP server for tenant-safe customer operations.',
      }, 60_000))
    }

    if (request.method === 'tools/list') {
      const user = await requireMcpUser(event)
      const siteId = typeof request.params?.site_id === 'string' ? request.params.site_id : null
      const siteCtx = siteId ? await getVisibleSiteContext(event, siteId) : null

      const entitlementKeys = siteCtx
        ? [...new Set(MCP_TOOLS.map(t => t.requiredEntitlement).filter(Boolean) as string[])]
        : []
      const activeEntitlements = siteCtx
        ? await getActiveEntitlements(user.db, siteCtx.organizationId, entitlementKeys)
        : new Set<string>()

      const tools = MCP_TOOLS
        .filter((tool) => {
          // Without a site_id, return all tools so AI clients (e.g. ChatGPT) can discover
          // the full capability set on first connection. Security is enforced at execution time.
          if (!siteId || !siteCtx) return true
          if (!roleSatisfies(siteCtx.role, tool.minimumRole)) return false
          if (tool.requiredEntitlement && !activeEntitlements.has(tool.requiredEntitlement)) return false
          return true
        })
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            domain: tool.domain,
            minimumRole: tool.minimumRole,
            confirmRequired: tool.confirmRequired,
          },
        }))

      return mcpSuccess(request.id, protocolCache('tools/list', { tools }, 30_000))
    }

    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      const rawArgs = (request.params?.arguments && typeof request.params.arguments === 'object' && !Array.isArray(request.params.arguments))
        ? request.params.arguments as Record<string, unknown>
        : Object.fromEntries(Object.entries(request.params ?? {}).filter(([key]) => key !== 'name'))

      const result = await executeMcpToolCall(event, toolName, rawArgs)
      return mcpSuccess(request.id, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      })
    }

    throw createError({ statusCode: 404, statusMessage: `Unsupported MCP method: ${request.method}` })
  } catch (error) {
    const mcpError = asMcpError(error)
    const errorStatus = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? Number((error as { statusCode: number }).statusCode)
      : null
    const status = errorStatus ?? (mcpError.code === MCP_ERROR.methodNotFound ? 404
      : mcpError.code === MCP_ERROR.invalidRequest || mcpError.code === MCP_ERROR.invalidParams ? 400
      : mcpError.code === MCP_ERROR.parse ? 400
      : 500)
    // Temporary: log all MCP errors so wrangler tail can capture them
    console.error('[MCP]', status, mcpError.code, mcpError.message, 'method:', requestId)
    setResponseStatus(event, status)
    if (status === 401) {
      const cfEnv = event.context.cloudflare?.env as { BETTER_AUTH_URL?: string } | undefined
      const baseUrl = (cfEnv?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
      setResponseHeader(event, 'WWW-Authenticate',
        `Bearer realm="${baseUrl}/api/mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`)
    }
    return mcpFailure(requestId, mcpError)
  }
})

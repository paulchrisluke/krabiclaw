import { createError, setResponseHeader } from 'h3'
import { asMcpError, mcpFailure, mcpSuccess, MCP_ERROR, MCP_PROTOCOL_VERSION, protocolCache, readMcpRequest } from '~/server/utils/mcp-protocol'
import { executeMcpToolCall } from '~/server/utils/mcp-executor'
import { getActiveEntitlements, getVisibleSiteContext, requireMcpUser, roleSatisfies } from '~/server/utils/mcp-auth'
import { MCP_TOOLS } from '~/server/utils/mcp-tools'

export default defineEventHandler(async (event) => {
  let requestId: string | number | null | undefined
  try {
    const body = await readBody(event)
    const request = readMcpRequest(event, body)
    requestId = request.id

    if (request.method === 'server/discover') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, protocolCache('server/discover', {
        supportedVersions: [MCP_PROTOCOL_VERSION],
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
          if (tool.name === 'list_sites' || tool.name === 'create_site') return true
          if (!siteId || !siteCtx) return false
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
        resultType: 'tools/call',
        isError: false,
        content: [{ type: 'json', json: result }],
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

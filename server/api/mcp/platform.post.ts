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
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
      return mcpSuccess(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' },
        instructions: 'KrabiClaw platform admin MCP. Use this app only for internal platform operations such as managing krabiclaw.com/blog and krabiclaw.com/docs. This app does not expose tenant site tools.',
      })
    }

    if (request.method === 'notifications/initialized') {
      setResponseStatus(event, 202)
      return ''
    }

    if (request.method === 'ping') {
      return mcpSuccess(request.id, {})
    }

    if (request.method === 'resources/list') {
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
      return mcpSuccess(request.id, { resources: [] })
    }

    if (request.method === 'resources/templates/list') {
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
      return mcpSuccess(request.id, { resourceTemplates: [] })
    }

    if (request.method === 'prompts/list') {
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
      return mcpSuccess(request.id, { prompts: [] })
    }

    if (request.method === 'server/discover') {
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
      return mcpSuccess(request.id, {
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'],
        capabilities: { tools: {} },
        serverInfo: { name: 'krabiclaw-platform-mcp', version: 'v1' },
        instructions: 'Internal KrabiClaw platform admin MCP for platform blog and docs operations only.',
      })
    }

    if (request.method === 'tools/list') {
      await requireMcpUser(event, {
        audiences: [`${baseUrl}/api/mcp/platform`, 'https://krabiclaw.com/api/mcp/platform'],
        requiredScopes: ['platform_admin'],
        forbiddenScopes: ['tenant'],
        requirePlatformAdmin: true,
      })
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

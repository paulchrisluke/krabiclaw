// Shared MCP JSON-RPC-over-HTTP transport plumbing for the two separate MCP
// resource surfaces (server/api/mcp.post.ts — tenant, server/api/mcp/platform.post.ts
// — platform admin). This is transport formatting, not authentication: each
// surface still builds its own requireMcpUser options (audience/scopes/
// requirePlatformAdmin), tool catalog, and tools/call execution — this file
// only extracts the byte-identical request/response shaping both files had
// duplicated (credential-missing handling, the seven non-tool-call protocol
// methods, and outer-catch error/telemetry shaping), per the Better Auth
// epic's "a configurable shared transport/runtime is allowed; a merged tool
// endpoint or tool-filter-only security boundary is not."
import { getHeader, setResponseStatus, type H3Event } from 'h3'
import {
  asMcpError,
  mcpFailure,
  mcpProtocolError,
  mcpSuccess,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type JsonRpcId,
  type McpRpcRequest,
} from '~/server/utils/mcp-protocol'
import { mcpHttpStatusForError, sendMcpErrorResponse, setMcpNotificationAccepted } from '~/server/utils/mcp-http-response'
import { requireMcpUser, type RequireMcpUserOptions } from '~/server/utils/mcp-auth'
import {
  buildMcpAuthChallengeForError,
  buildMcpOAuthChallenge,
  describeMcpAuthTelemetryError,
  mcpAuthRequiredResult,
  mcpToolErrorResult,
  setMcpAuthChallenge,
} from '~/server/utils/mcp-route-helpers'

export interface McpToolMeta {
  domain?: string | null
  isMutating?: boolean
}

export interface McpSurfaceRuntimeConfig {
  authOptions: RequireMcpUserOptions
  resourceMetadataUrl: (_baseUrl: string) => string
  authDescription: string
  authRequiredText: string
  logEvent: (_event: H3Event, _fields: Record<string, unknown>) => void
  resolveToolMeta: (_toolName: string | null) => McpToolMeta
}

/**
 * Handles the pre-parse "no bearer token, no cookie" branch shared by both
 * surfaces: a `tools/call` request must fail as a 200 JSON-RPC envelope
 * carrying an embedded auth-required tool result (MCP clients can't act on a
 * raw 401 mid-tool-call), while every other method fails with a real 401 +
 * WWW-Authenticate so OAuth clients can discover the authorization server.
 * Returns `{ handled: false }` when a bearer token or cookie is present, so
 * the caller proceeds to read and dispatch the real request body.
 */
export async function resolveMissingMcpCredential(
  event: H3Event,
  config: Pick<McpSurfaceRuntimeConfig, 'resourceMetadataUrl' | 'authDescription' | 'authRequiredText' | 'logEvent' | 'resolveToolMeta'>,
  baseUrl: string,
): Promise<
  | { handled: false }
  | { handled: true; requestId: JsonRpcId | undefined; requestMethod: string | undefined; requestToolName: string | undefined; response: unknown }
> {
  if (getHeader(event, 'authorization')?.startsWith('Bearer ') || getHeader(event, 'cookie')) {
    return { handled: false }
  }

  const body = await readBody(event)
  const rawBody = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  const requestId = rawBody?.id as JsonRpcId | undefined
  const requestMethod = rawBody?.method as string | undefined
  const requestToolName = rawBody?.params && typeof rawBody.params === 'object' && !Array.isArray(rawBody.params)
    && typeof (rawBody.params as Record<string, unknown>).name === 'string'
    ? String((rawBody.params as Record<string, unknown>).name)
    : undefined

  const authChallenge = buildMcpOAuthChallenge({
    resourceMetadataUrl: config.resourceMetadataUrl(baseUrl),
    description: config.authDescription,
  })

  if (requestMethod === 'tools/call') {
    const toolMeta = config.resolveToolMeta(requestToolName ?? null)
    config.logEvent(event, {
      requestId: requestId ?? null,
      method: requestMethod,
      toolName: requestToolName ?? null,
      toolDomain: requestToolName ? toolMeta.domain ?? null : null,
      status: 'auth_required',
      errorMessage: 'credential_missing: missing bearer token or cookie',
    })
    return {
      handled: true,
      requestId,
      requestMethod,
      requestToolName,
      response: mcpSuccess(requestId ?? null, mcpAuthRequiredResult({ challenge: authChallenge, message: config.authRequiredText })),
    }
  }

  setResponseStatus(event, 401)
  setMcpAuthChallenge(event, authChallenge)
  return {
    handled: true,
    requestId,
    requestMethod,
    requestToolName,
    response: mcpFailure(requestId ?? null, { code: MCP_ERROR.invalidRequest, message: 'Authentication required.' }),
  }
}

export interface McpResourceCatalog {
  list: unknown[]
  read: (_uri: string, _event: H3Event) => Promise<unknown> | unknown
}

export interface McpPromptCatalog {
  list: unknown[]
  render: (_name: string, _args: Record<string, string>) => { description: string; text: string }
}

export interface McpDiscoverInfo {
  serverName: string
  serverVersion: string
  instructions: string
}

/**
 * Dispatches the seven MCP methods whose handling is identical in shape
 * across both surfaces — everything except `initialize` (whose instructions
 * text and serverInfo are surface-specific product copy), `tools/list`
 * (whose visibility/entitlement filtering is genuinely different per
 * surface), and `tools/call` (whose execution/telemetry is genuinely
 * different per surface). Returns `undefined` when `request.method` isn't
 * one of these seven, so the caller falls through to its own handling.
 */
export async function dispatchStandardMcpMethod(
  event: H3Event,
  request: McpRpcRequest,
  runtime: Pick<McpSurfaceRuntimeConfig, 'authOptions' | 'logEvent'>,
  catalog: { resources: McpResourceCatalog; prompts: McpPromptCatalog; discover: McpDiscoverInfo },
): Promise<unknown | undefined> {
  if (request.method === 'notifications/initialized') {
    runtime.logEvent(event, {
      requestId: request.id ?? null,
      method: request.method,
      status: 'success',
      httpStatus: 202,
      protocolVersion: MCP_PROTOCOL_VERSION,
    })
    return setMcpNotificationAccepted(event)
  }

  if (request.method === 'ping') {
    // Intentionally unauthenticated: MCP clients use ping as a liveness check
    // before the OAuth handshake completes, and it returns no information
    // beyond {}.
    runtime.logEvent(event, {
      requestId: request.id,
      method: request.method,
      status: 'success',
      httpStatus: 200,
      protocolVersion: MCP_PROTOCOL_VERSION,
    })
    return mcpSuccess(request.id, {})
  }

  if (request.method === 'resources/list') {
    const user = await requireMcpUser(event, runtime.authOptions)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      result: { count: catalog.resources.list.length },
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, { resources: catalog.resources.list })
  }

  if (request.method === 'resources/templates/list') {
    const user = await requireMcpUser(event, runtime.authOptions)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      result: { count: 0 },
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, { resourceTemplates: [] })
  }

  if (request.method === 'resources/read') {
    const user = await requireMcpUser(event, runtime.authOptions)
    const uri = typeof request.params?.uri === 'string' ? request.params.uri : ''
    const content = await catalog.resources.read(uri, event)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      result: { uri },
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, { contents: [content] })
  }

  if (request.method === 'prompts/list') {
    const user = await requireMcpUser(event, runtime.authOptions)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      result: { count: catalog.prompts.list.length },
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, { prompts: catalog.prompts.list })
  }

  if (request.method === 'prompts/get') {
    const user = await requireMcpUser(event, runtime.authOptions)
    const name = typeof request.params?.name === 'string' ? request.params.name : ''
    const rawPromptArgs = request.params?.arguments
    const promptArgs: Record<string, string> = {}
    if (rawPromptArgs && typeof rawPromptArgs === 'object' && !Array.isArray(rawPromptArgs)) {
      for (const [key, value] of Object.entries(rawPromptArgs as Record<string, unknown>)) {
        if (typeof value === 'string') promptArgs[key] = value
      }
    }
    const rendered = catalog.prompts.render(name, promptArgs)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      toolName: name || null,
      result: { name },
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, {
      description: rendered.description,
      messages: [{ role: 'user', content: { type: 'text', text: rendered.text } }],
    })
  }

  if (request.method === 'server/discover') {
    const user = await requireMcpUser(event, runtime.authOptions)
    runtime.logEvent(event, {
      userId: user.userId,
      requestId: request.id,
      method: request.method,
      status: 'success',
      httpStatus: 200,
      oauthClientId: user.oauthClientId ?? null,
    })
    return mcpSuccess(request.id, {
      supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
      capabilities: { tools: {} },
      serverInfo: { name: catalog.discover.serverName, version: catalog.discover.serverVersion },
      instructions: catalog.discover.instructions,
    })
  }

  return undefined
}

export function unsupportedMcpMethodError(method: string | undefined) {
  return mcpProtocolError(MCP_ERROR.methodNotFound, `Unsupported MCP method: ${method}`, undefined, 'protocol')
}

/**
 * Shared outer-catch error shaping: computes the JSON-RPC/HTTP error shape,
 * logs `tools/call` telemetry uniformly (auth_required vs error, with
 * toolDomain/isMutating/arguments resolved from the surface's own tool
 * catalog), and dispatches to the auth-challenge response, the tool-call
 * permission-error response, or the generic error response.
 */
export function respondToMcpError(
  event: H3Event,
  error: unknown,
  input: {
    requestId: JsonRpcId | undefined
    requestMethod: string | undefined
    requestToolName: string | undefined
    requestToolArgs: Record<string, unknown> | undefined
    baseUrl: string
    resourceMetadataUrl: (_baseUrl: string) => string
    authDescription: string
    authRequiredText: string
    logEvent: (_event: H3Event, _fields: Record<string, unknown>) => void
    resolveToolMeta: (_toolName: string | null) => McpToolMeta
  },
) {
  const mcpError = asMcpError(error)
  const toolCallPermissionError = input.requestMethod === 'tools/call' && mcpError.kind === 'forbidden'
  const mappedStatus = toolCallPermissionError ? 200 : mcpHttpStatusForError(mcpError)

  if (input.requestMethod === 'tools/call') {
    const toolMeta = input.resolveToolMeta(input.requestToolName ?? null)
    const isAuthRequired = error instanceof Error && /Authentication required/i.test(error.message)
    input.logEvent(event, {
      requestId: input.requestId ?? null,
      method: input.requestMethod,
      toolName: input.requestToolName ?? null,
      toolDomain: input.requestToolName ? toolMeta.domain ?? null : null,
      isMutating: toolMeta.isMutating ?? false,
      arguments: input.requestToolArgs,
      status: isAuthRequired ? 'auth_required' : 'error',
      errorCode: mcpError.code,
      errorMessage: isAuthRequired
        ? describeMcpAuthTelemetryError(error)
        : error instanceof Error ? error.message : String(error),
      httpStatus: mappedStatus,
      jsonrpcErrorCode: mcpError.code,
      jsonrpcErrorMessage: mcpError.message,
      unknownToolName: mcpError.kind === 'protocol' && input.requestToolName ? input.requestToolName : null,
    })
  }

  if (mcpError.kind === 'auth') {
    const authChallenge = buildMcpAuthChallengeForError(error, {
      resourceMetadataUrl: input.resourceMetadataUrl(input.baseUrl),
      defaultDescription: input.authDescription,
    })
    if (input.requestMethod === 'tools/call') {
      return mcpSuccess(input.requestId, mcpAuthRequiredResult({ challenge: authChallenge, message: input.authRequiredText }))
    }
    return sendMcpErrorResponse(event, { id: input.requestId, error: mcpError, authChallenge })
  }

  if (toolCallPermissionError) {
    return mcpSuccess(input.requestId, mcpToolErrorResult(mcpError.message))
  }

  return sendMcpErrorResponse(event, { id: input.requestId, error: mcpError })
}

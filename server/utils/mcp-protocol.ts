import { getHeader, type H3Event } from 'h3'

export const MCP_PROTOCOL_VERSION = '2025-11-25'
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'])

export type JsonRpcId = string | number | null

export interface McpRpcRequest {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export interface McpErrorShape {
  code: number
  message: string
  data?: unknown
  kind?: McpFailureKind
}

export type McpFailureKind =
  | 'protocol'
  | 'tool_execution'
  | 'auth'
  | 'transport'

export const MCP_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const

function metaString(request: McpRpcRequest, key: string) {
  const value = request._meta?.[key]
  return typeof value === 'string' ? value : null
}

export function readMcpRequest(event: H3Event, body: unknown): McpRpcRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Invalid JSON-RPC request body.')
  }

  const request = body as McpRpcRequest
  const headerMethod = getHeader(event, 'mcp-method')
  const headerVersion = getHeader(event, 'mcp-protocol-version')
  const headerName = getHeader(event, 'mcp-name')

  const method = request.method ?? headerMethod ?? metaString(request, 'io.modelcontextprotocol/method')
  if (!method) {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Missing MCP method.')
  }

  // For `initialize`, the version lives in params.protocolVersion (body), not a header.
  const bodyVersion = typeof (body as Record<string, unknown> & { params?: { protocolVersion?: unknown } })
    ?.params?.protocolVersion === 'string'
    ? (body as { params: { protocolVersion: string } }).params.protocolVersion
    : null
  const version = headerVersion ?? metaString(request, 'io.modelcontextprotocol/version') ?? bodyVersion
  const isNotification = typeof method === 'string' && method.startsWith('notifications/')
  if (!version && !isNotification) {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Missing MCP protocol version.')
  }
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.has(version)) {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, `Unsupported MCP protocol version: ${version}`)
  }

  if (request.jsonrpc && request.jsonrpc !== '2.0') {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Only JSON-RPC 2.0 is supported.')
  }

  if (method === 'tools/call') {
    const toolName = headerName
      ?? metaString(request, 'io.modelcontextprotocol/name')
      ?? (typeof request.params?.name === 'string' ? request.params.name : null)
    if (!toolName) {
      throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Missing MCP tool name.')
    }
    request.params = {
      ...(request.params ?? {}),
      name: toolName,
    }
  }

  request.method = method
  request._meta = {
    ...(request._meta ?? {}),
    'io.modelcontextprotocol/version': version,
  }
  return request
}

export function mcpSuccess(id: JsonRpcId | undefined, result: unknown) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  }
}

export function mcpFailure(id: JsonRpcId | undefined, error: McpErrorShape) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error,
  }
}

export function mcpProtocolError(code: number, message: string, data?: unknown, kind: McpFailureKind = 'tool_execution') {
  const error = new Error(message) as Error & { mcp: McpErrorShape }
  error.mcp = { code, message, data, kind }
  return error
}

// Protocol-level fields that can legitimately appear alongside `arguments` in
// a `tools/call` params object (or, for older clients that never nested
// arguments under `arguments`, alongside the flattened tool arguments
// themselves). These must never be misclassified as unknown tool arguments.
const MCP_CALL_PROTOCOL_PARAM_KEYS = new Set(['name', '_meta', 'task'])

// Shared by both MCP surfaces (server/api/mcp.post.ts, server/api/mcp/platform.post.ts)
// so `tools/call` argument parsing — including malformed-envelope detection and
// legacy flattened-argument support — stays a single canonical contract.
export function parseMcpToolCallArguments(params: Record<string, unknown> | undefined): Record<string, unknown> {
  const callParams = params ?? {}
  if ('arguments' in callParams) {
    const argsValue = callParams.arguments
    if (!argsValue || typeof argsValue !== 'object' || Array.isArray(argsValue)) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'arguments must be an object.')
    }
    return argsValue as Record<string, unknown>
  }
  // Legacy flattened-arguments support: some older clients send tool
  // arguments as top-level params fields instead of nesting them under
  // `arguments`. Exclude protocol-level fields so they aren't misclassified
  // as unknown tool arguments by strict-schema validation.
  return Object.fromEntries(
    Object.entries(callParams).filter(([key]) => !MCP_CALL_PROTOCOL_PARAM_KEYS.has(key)),
  )
}

export function asMcpError(error: unknown): McpErrorShape {
  if (error && typeof error === 'object' && 'mcp' in error) {
    const shape = (error as { mcp: McpErrorShape }).mcp
    return { code: shape.code, message: shape.message, data: shape.data, kind: shape.kind }
  }

  // Business-logic validation shared between REST dashboard routes and MCP
  // tool executors (e.g. server/utils/experiences.ts) throws h3's createError
  // with statusCode 400/404 rather than mcpProtocolError, since it has no MCP
  // awareness. Treat those as tool execution failures so tools/call converts
  // them to isError:true results instead of leaking raw HTTP errors.
  if (error && typeof error === 'object' && [400, 404].includes(Number((error as { statusCode?: unknown }).statusCode))) {
    const message = typeof (error as { statusMessage?: unknown }).statusMessage === 'string'
      ? (error as { statusMessage: string }).statusMessage
      : error instanceof Error ? error.message : 'Invalid request.'
    return { code: MCP_ERROR.invalidParams, message, kind: 'tool_execution' }
  }

  if (error instanceof Error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    const kind: McpFailureKind = statusCode === 401 || statusCode === 403 ? 'auth' : 'transport'
    return { code: MCP_ERROR.internal, message: error.message, kind }
  }

  return { code: MCP_ERROR.internal, message: 'Internal server error', kind: 'transport' }
}

export function protocolCache(resultType: string, payload: Record<string, unknown>, ttlMs = 30_000) {
  return {
    resultType,
    ttlMs,
    cacheScope: 'private',
    ...payload,
  }
}

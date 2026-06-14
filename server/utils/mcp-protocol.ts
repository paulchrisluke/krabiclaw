import { getHeader, type H3Event } from 'h3'

export const MCP_PROTOCOL_VERSION = '2025-03-26'
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-03-26', '2024-11-05'])

type JsonRpcId = string | number | null

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
}

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

  const version = headerVersion ?? metaString(request, 'io.modelcontextprotocol/version')
  if (!version) {
    throw mcpProtocolError(MCP_ERROR.invalidRequest, 'Missing MCP protocol version.')
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.has(version)) {
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

export function mcpProtocolError(code: number, message: string, data?: unknown) {
  const error = new Error(message) as Error & { mcp: McpErrorShape }
  error.mcp = { code, message, data }
  return error
}

export function asMcpError(error: unknown): McpErrorShape {
  if (error && typeof error === 'object' && 'mcp' in error) {
    const shape = (error as { mcp: McpErrorShape }).mcp
    return { code: shape.code, message: shape.message, data: shape.data }
  }

  if (error instanceof Error) {
    return { code: MCP_ERROR.internal, message: error.message }
  }

  return { code: MCP_ERROR.internal, message: 'Internal server error' }
}

export function protocolCache(resultType: string, payload: Record<string, unknown>, ttlMs = 30_000) {
  return {
    resultType,
    ttlMs,
    cacheScope: 'private',
    ...payload,
  }
}

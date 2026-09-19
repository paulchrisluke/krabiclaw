// Error-shaping shared between the MCP route (server/api/mcp.post.ts) and
// every tool executor. JSON-RPC envelope parsing, protocol-version
// negotiation, and the standard non-tool-call methods now belong to
// @modelcontextprotocol/server (see server/api/mcp.post.ts) — this file only
// keeps the pieces executors and the route still need: a typed error shape
// business logic can throw, and the two envelope builders used for the
// handful of responses the route still builds by hand (credential-missing,
// pre-dispatch auth failures) before handing off to the SDK.

export type JsonRpcId = string | number | null

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
  | 'forbidden'
  | 'transport'

export const MCP_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const

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

export function asMcpError(error: unknown): McpErrorShape {
  if (error && typeof error === 'object' && 'mcp' in error) {
    const shape = (error as { mcp: McpErrorShape }).mcp
    return { code: shape.code, message: shape.message, data: shape.data, kind: shape.kind }
  }

  // Business-logic validation shared between REST dashboard routes and MCP
  // tool executors (e.g. server/utils/experiences.ts) throws h3's HTTPError
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
    const kind: McpFailureKind = statusCode === 401 ? 'auth' : statusCode === 403 ? 'forbidden' : 'transport'
    return { code: MCP_ERROR.internal, message: error.message, kind }
  }

  return { code: MCP_ERROR.internal, message: 'Internal server error', kind: 'transport' }
}

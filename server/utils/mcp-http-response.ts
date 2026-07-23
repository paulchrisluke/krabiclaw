import { setResponseStatus, type H3Event } from 'h3'
import { MCP_ERROR, mcpFailure, type JsonRpcId, type McpErrorShape } from '~/server/utils/mcp-protocol'
import { setMcpAuthChallenge } from '~/server/utils/mcp-route-helpers'

interface McpErrorHttpResponseInput {
  id: JsonRpcId | undefined
  error: McpErrorShape
  authChallenge?: string | null
}

export function mcpHttpStatusForError(error: McpErrorShape): number {
  if (error.kind === 'auth') return 401
  if (error.kind === 'transport') return 500
  if (
    error.code === MCP_ERROR.methodNotFound
    || error.code === MCP_ERROR.invalidRequest
    || error.code === MCP_ERROR.invalidParams
    || error.code === MCP_ERROR.parse
    || error.code === MCP_ERROR.internal
  ) {
    return 200
  }
  return 200
}

export function sendMcpErrorResponse(
  event: H3Event,
  input: McpErrorHttpResponseInput,
) {
  const status = mcpHttpStatusForError(input.error)
  setResponseStatus(event, status)
  if (status === 401 && input.authChallenge) {
    setMcpAuthChallenge(event, input.authChallenge)
  }
  return mcpFailure(input.id, input.error)
}

export function setMcpNotificationAccepted(event: H3Event) {
  setResponseStatus(event, 202)
  return ''
}

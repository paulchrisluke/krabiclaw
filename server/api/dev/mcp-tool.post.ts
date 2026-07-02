import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { executeMcpToolCall } from '~/server/utils/mcp-executor'
import { isMcpRenderResponse } from '~/server/utils/mcp-render'

export default defineEventHandler(async (event) => {
  assertDevRouteAllowed(event)

  const body = await readBody(event) as {
    siteId: string
    toolName: string
    input: Record<string, unknown>
  }

  const rawArguments = { site_id: body.siteId, ...body.input }
  const result = await executeMcpToolCall(event, body.toolName, rawArguments)

  // Unwrap structured MCP responses — tests care about the payload, not fallback text.
  if (isMcpRenderResponse(result)) {
    return { result: result.structuredContent }
  }

  return { result }
})

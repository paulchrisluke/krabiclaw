import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'

// Top-level-only: does not validate nested array/object shapes, types, enums,
// or conditional requirements (oneOf/if-then) inside a tool's inputSchema —
// only whether the caller sent a key the schema doesn't declare at all.
export function validateNoUnknownTopLevelArguments(schema: Record<string, unknown>, args: Record<string, unknown>) {
  if (schema.additionalProperties !== false) return

  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties as Record<string, unknown>
    : {}
  const allowedKeys = new Set(Object.keys(properties))

  const unknownKeys = Object.keys(args).filter(key => !allowedKeys.has(key)).sort()
  if (unknownKeys.length) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Unknown argument${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}`,
    )
  }
}

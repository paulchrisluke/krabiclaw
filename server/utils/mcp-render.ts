export interface McpStructuredResponse {
  __mcpStructuredResponse: true
  structuredContent: unknown
  fallbackText?: string
  privateMeta?: Record<string, unknown>
}

export function renderStructuredResponse(
  structuredContent: unknown,
  fallbackText?: string,
  privateMeta?: Record<string, unknown>,
): McpStructuredResponse {
  return { __mcpStructuredResponse: true, structuredContent, fallbackText, privateMeta }
}

export function isMcpRenderResponse(value: unknown): value is McpStructuredResponse {
  return (
    typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>).__mcpStructuredResponse === true
    && 'structuredContent' in value
  )
}

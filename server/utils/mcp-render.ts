export interface McpStructuredResponse {
  __mcpStructuredResponse: true
  structuredContent: unknown
  modelText?: string
  privateMeta?: Record<string, unknown>
}

export function renderStructuredResponse(
  structuredContent: unknown,
  modelText?: string,
  privateMeta?: Record<string, unknown>,
): McpStructuredResponse {
  return { __mcpStructuredResponse: true, structuredContent, modelText, privateMeta }
}

export function isMcpRenderResponse(value: unknown): value is McpStructuredResponse {
  return (
    typeof value === 'object'
    && value !== null
    && (value as Record<string, unknown>).__mcpStructuredResponse === true
    && 'structuredContent' in value
  )
}

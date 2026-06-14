export interface McpRenderResponse {
  __widget: string
  structuredContent: unknown
  fallbackText?: string
}

export function renderWidget(
  widgetName: string,
  structuredContent: unknown,
  fallbackText?: string,
): McpRenderResponse {
  return { __widget: widgetName, structuredContent, fallbackText }
}

export function isMcpRenderResponse(value: unknown): value is McpRenderResponse {
  return (
    typeof value === 'object'
    && value !== null
    && '__widget' in value
    && typeof (value as Record<string, unknown>).__widget === 'string'
    && 'structuredContent' in value
  )
}

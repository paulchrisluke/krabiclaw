// Exposes the real MCP widget-enablement state so public/widget-test.html can render
// "enabled" vs "disabled" tabs from the same source of truth mcp.post.ts enforces,
// instead of a hand-maintained boolean that drifts from prod.
import { setResponseHeader } from 'h3'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { MCP_TOOLS } from '~/server/utils/mcp-tools'
import { WIDGETS_ENABLED, isWidgetEnabledForTool } from '~/server/utils/mcp-widget-config'

export default defineEventHandler((event) => {
  assertDevRouteAllowed(event)

  // public/widget-test.html is served by a separate static file server (yarn test:widgets,
  // python3 -m http.server on :4444) so this is a cross-origin request to the Nuxt dev server.
  // Safe to allow broadly — assertDevRouteAllowed already 404s this route outside dev/E2E.
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')

  const tools = MCP_TOOLS
    .filter((tool) => Boolean(tool.widgetName))
    .map((tool) => ({
      name: tool.name,
      widgetName: tool.widgetName!,
      enabled: isWidgetEnabledForTool(tool.name),
    }))

  return { widgetsEnabled: WIDGETS_ENABLED, tools }
})

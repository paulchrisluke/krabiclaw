import { createError, getHeader, getRequestURL, setResponseHeader } from 'h3'
import { asMcpError, mcpFailure, mcpProtocolError, mcpSuccess, MCP_ERROR, MCP_PROTOCOL_VERSION, readMcpRequest } from '~/server/utils/mcp-protocol'
import { executeMcpToolCall } from '~/server/utils/mcp-executor'
import { isMcpRenderResponse } from '~/server/utils/mcp-render'
import { getActiveEntitlements, getVisibleSiteContext, requireMcpUser, roleSatisfies } from '~/server/utils/mcp-auth'
import { MCP_TOOLS } from '~/server/utils/mcp-tools'

const WIDGET_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'

function widgetResourceUri(name: string) {
  return `ui://widget/${name}.html`
}

function requestOrigin(event: Parameters<typeof getRequestURL>[0]) {
  return getRequestURL(event).origin.replace(/\/$/, '')
}

export default defineEventHandler(async (event) => {
  let requestId: string | number | null | undefined
  try {
    // Return 401 with WWW-Authenticate before any protocol parsing so OAuth
    // clients (e.g. ChatGPT) can discover the authorization server on first touch.
    // Session-cookie requests (dashboard, E2E tests) have a Cookie header and skip this.
    if (!getHeader(event, 'authorization')?.startsWith('Bearer ') && !getHeader(event, 'cookie')) {
      const cfEnv = event.context.cloudflare?.env as { BETTER_AUTH_URL?: string } | undefined
      const baseUrl = (cfEnv?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
      setResponseStatus(event, 401)
      setResponseHeader(event, 'WWW-Authenticate',
        `Bearer realm="${baseUrl}/api/mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`)
      return mcpFailure(null, { code: MCP_ERROR.invalidRequest, message: 'Authentication required.' })
    }

    const body = await readBody(event)

    // ChatGPT occasionally sends an empty-body health probe — ignore silently.
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      setResponseStatus(event, 200)
      return ''
    }

    const request = readMcpRequest(event, body)
    requestId = request.id

    // MCP protocol handshake — required before any tools/list or tools/call
    if (request.method === 'initialize') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'krabiclaw-mcp', version: 'phase-5' },
        instructions: `KrabiClaw — manage your restaurant or business website through this connection.

Start every conversation by calling show_welcome to discover the user's sites and display the interactive site picker widget.
- If they have 0 sites, start the Onboarding Flow: 
  1. Ask for their Google Maps URL (or shortlink) to import their business details.
  2. Call import_from_maps.
  3. After import, ask for Required missing context: "What should the main button say (e.g., Book Now)?" and ask if they want to upload a Hero Image or have AI generate one.
  4. Ask for Optional context: "What's the short story behind your business?" and "Do you have a logo to upload?" (let them skip these).
  5. DO NOT ask for menus, detailed services, or social links yet (defer until the site is live).
  6. Call create_site and create_location, then show_site_preview.
- If they have exactly one site, use it automatically and confirm: "Working with [site name]."
- If they have multiple sites, present them clearly and ask which to use.

All other tools require a site_id obtained from list_sites. Never guess or invent site IDs.

Common workflows: update menus and items, draft and publish posts, triage contact and reservation submissions, manage page content drafts, upload media, translate content, reply to reviews, and manage experiences and bookings.`,
      })
    }

    // Client acknowledgement after initialize — spec requires 202 with no body
    if (request.method === 'notifications/initialized') {
      setResponseStatus(event, 202)
      return ''
    }

    // Standard ping
    if (request.method === 'ping') {
      return mcpSuccess(request.id, {})
    }

    // Widget resources served as ui://widget/{name}.html with the MCP Apps UI MIME type.
    // ChatGPT fetches these when it sees openai/outputTemplate on a tool definition.
    const WIDGETS = [
      { name: 'welcome-list',    title: 'Site Picker' },
      { name: 'vertical-picker', title: 'Business Type Picker' },
      { name: 'photo-album',     title: 'Business Photos' },
      { name: 'image-carousel',  title: 'Image Carousel' },
      { name: 'site-preview',    title: 'Site Preview' },
    ] as const

    function widgetHtml(name: string, baseUrl: string) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>KrabiClaw</title>
<script type="module" crossorigin src="${baseUrl}/mcp-assets/${name}.js"></script>
<link rel="modulepreload" crossorigin href="${baseUrl}/mcp-assets/jsx-runtime-chunk.js">
</head>
<body><div id="app"></div></body>
</html>`
    }

    if (request.method === 'resources/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, {
        resources: WIDGETS.map(w => ({
          uri: widgetResourceUri(w.name),
          name: w.title,
          description: `${w.title} widget`,
          mimeType: WIDGET_RESOURCE_MIME_TYPE,
        })),
      })
    }

    if (request.method === 'resources/templates/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, { resourceTemplates: [] })
    }

    if (request.method === 'resources/read') {
      await requireMcpUser(event)
      const uri = typeof request.params?.uri === 'string' ? request.params.uri : ''
      const match = uri.match(/^ui:\/\/widget\/(.+?)(?:\.html)?$/)
      if (!match) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown resource: ${uri}`)
      }
      const widgetName = match[1]!
      if (!WIDGETS.some(w => w.name === widgetName)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown widget: ${widgetName}`)
      }
      const baseUrl = requestOrigin(event)
      return mcpSuccess(request.id, {
        contents: [{
          uri: widgetResourceUri(widgetName),
          mimeType: WIDGET_RESOURCE_MIME_TYPE,
          text: widgetHtml(widgetName, baseUrl),
          _meta: {
            ui: {
              prefersBorder: true,
              domain: baseUrl,
              csp: {
                connectDomains: [baseUrl],
                resourceDomains: [baseUrl],
              },
            },
            'openai/widgetDescription': `${WIDGETS.find(w => w.name === widgetName)?.title ?? 'KrabiClaw'} widget`,
            'openai/widgetPrefersBorder': true,
            'openai/widgetDomain': baseUrl,
            'openai/widgetCSP': {
              connect_domains: [baseUrl],
              resource_domains: [baseUrl],
              redirect_domains: [baseUrl, 'https://krabiclaw.com'],
            },
          },
        }],
      })
    }

    if (request.method === 'prompts/list') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, { prompts: [] })
    }

    if (request.method === 'server/discover') {
      await requireMcpUser(event)
      return mcpSuccess(request.id, {
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'],
        capabilities: { tools: {} },
        serverInfo: {
          name: 'krabiclaw-mcp',
          version: 'phase-5',
        },
        instructions: 'KrabiClaw MCP. Call show_welcome at the start of every conversation to display the site picker and discover the user\'s sites. Use the site_id from that interaction with all other tools.',
      })
    }

    if (request.method === 'tools/list') {
      const user = await requireMcpUser(event)
      const siteId = typeof request.params?.site_id === 'string' ? request.params.site_id : null
      const siteCtx = siteId ? await getVisibleSiteContext(event, siteId) : null

      const entitlementKeys = siteCtx
        ? [...new Set(MCP_TOOLS.map(t => t.requiredEntitlement).filter(Boolean) as string[])]
        : []
      const activeEntitlements = siteCtx
        ? await getActiveEntitlements(user.db, siteCtx.organizationId, entitlementKeys)
        : new Set<string>()

      const tools = MCP_TOOLS
        .filter((tool) => {
          // Without a site_id, return all tools so AI clients (e.g. ChatGPT) can discover
          // the full capability set on first connection. Security is enforced at execution time.
          if (!siteId || !siteCtx) return true
          if (!roleSatisfies(siteCtx.role, tool.minimumRole)) return false
          if (tool.requiredEntitlement && !activeEntitlements.has(tool.requiredEntitlement)) return false
          return true
        })
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: {
            domain: tool.domain,
            minimumRole: tool.minimumRole,
            confirmRequired: tool.confirmRequired,
          },
          ...(tool.widgetName ? {
            _meta: {
              ui: { resourceUri: widgetResourceUri(tool.widgetName) },
              'openai/outputTemplate': widgetResourceUri(tool.widgetName),
              'openai/widgetAccessible': true,
              'openai/toolInvocation/invoking': tool.widgetInvoking ?? 'Loading…',
              'openai/toolInvocation/invoked': tool.widgetInvoked ?? 'Done',
            },
          } : {}),
        }))

      return mcpSuccess(request.id, { tools })
    }

    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : ''
      const rawArgs = (request.params?.arguments && typeof request.params.arguments === 'object' && !Array.isArray(request.params.arguments))
        ? request.params.arguments as Record<string, unknown>
        : Object.fromEntries(Object.entries(request.params ?? {}).filter(([key]) => key !== 'name'))

      const result = await executeMcpToolCall(event, toolName, rawArgs)
      if (isMcpRenderResponse(result)) {
        const tool = MCP_TOOLS.find(t => t.name === toolName)
        return mcpSuccess(request.id, {
          isError: false,
          structuredContent: result.structuredContent,
          content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
          _meta: {
            'openai/toolInvocation/invoking': tool?.widgetInvoking ?? 'Loading…',
            'openai/toolInvocation/invoked': tool?.widgetInvoked ?? 'Done',
          },
        })
      }
      return mcpSuccess(request.id, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      })
    }

    throw createError({ statusCode: 404, statusMessage: `Unsupported MCP method: ${request.method}` })
  } catch (error) {
    const mcpError = asMcpError(error)
    const errorStatus = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? Number((error as { statusCode: number }).statusCode)
      : null
    const status = errorStatus ?? (mcpError.code === MCP_ERROR.methodNotFound ? 404
      : mcpError.code === MCP_ERROR.invalidRequest || mcpError.code === MCP_ERROR.invalidParams ? 400
      : mcpError.code === MCP_ERROR.parse ? 400
      : 500)
    // Temporary: log all MCP errors so wrangler tail can capture them
    console.error('[MCP]', status, mcpError.code, mcpError.message, 'method:', requestId)
    setResponseStatus(event, status)
    if (status === 401) {
      const cfEnv = event.context.cloudflare?.env as { BETTER_AUTH_URL?: string } | undefined
      const baseUrl = (cfEnv?.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
      setResponseHeader(event, 'WWW-Authenticate',
        `Bearer realm="${baseUrl}/api/mcp", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`)
    }
    return mcpFailure(requestId, mcpError)
  }
})

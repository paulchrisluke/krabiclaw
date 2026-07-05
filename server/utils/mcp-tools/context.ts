import type { McpToolDefinition } from './shared'
import { globalTool, locationListItemObject, organizationListItemObject, siteListItem, withToolAnnotations, workspaceContextObject } from './shared'

export const CONTEXT_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'get_workspace_context',
      description: 'Get the active MCP organization, site, and location context, plus the accessible sites and locations available for this user.',
      domain: 'context',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: true },
      outputSchema: {
        type: 'object',
        properties: {
          context: workspaceContextObject,
          organizations: { type: 'array', items: organizationListItemObject },
          sites: { type: 'array', items: siteListItem },
          locations: { type: 'array', items: locationListItemObject },
        },
        required: ['context', 'organizations', 'sites', 'locations'],
      },
    })),
  globalTool(withToolAnnotations({
      name: 'set_workspace_context',
      description: 'Persist the active MCP site and optional location so later tool calls can omit raw IDs. Pass site_id to switch sites. Pass location_id to switch locations within the active or specified site.',
      domain: 'context',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          organization_id: { type: 'string' },
          site_id: { type: 'string', description: 'Site id, subdomain, or custom domain.' },
          location_id: { type: 'string', description: 'Location id or slug.' },
        },
        anyOf: [
          { required: ['organization_id'] },
          { required: ['site_id'] },
          { required: ['location_id'] },
        ],
        additionalProperties: true,
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          context: workspaceContextObject,
          organizations: { type: 'array', items: organizationListItemObject },
          sites: { type: 'array', items: siteListItem },
          locations: { type: 'array', items: locationListItemObject },
        },
        required: ['success', 'context', 'organizations', 'sites', 'locations'],
      },
    })),
]

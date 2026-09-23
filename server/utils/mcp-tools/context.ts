import type { McpToolDefinition } from './shared'
import { globalTool, locationListItemObject, organizationListItemObject, withToolAnnotations, workspaceContextObject } from './shared'

export const CONTEXT_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'get_workspace_context',
      description: 'Get the active MCP organization and location context, plus the organizations and locations available to this user. Use context.organization_id or one of the returned organization ids as organization_id for tenant-scoped tools; do not pass public URLs, hostnames, custom domains, subdomains, slugs, or business names as organization_id.',
      domain: 'context',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: true },
      outputSchema: {
        type: 'object',
        properties: {
          context: workspaceContextObject,
          organizations: { type: 'array', items: organizationListItemObject },
          locations: { type: 'array', items: locationListItemObject },
        },
        required: ['context', 'organizations', 'locations'],
      },
    })),
  globalTool(withToolAnnotations({
      name: 'set_workspace_context',
      description: 'Persist the active MCP organization and optional location so later tool calls can omit raw IDs. Pass an internal organization_id from get_workspace_context or list_organizations to switch tenants. Do not pass a public URL, hostname, custom domain, subdomain, slug, or business name as organization_id. Pass location_id to switch locations within the active or specified organization.',
      domain: 'context',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        type: 'object',
        properties: {
          organization_id: { type: 'string' },
          location_id: { type: 'string', description: 'Location id or slug.' },
        },
        anyOf: [
          { required: ['organization_id'] },
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
          locations: { type: 'array', items: locationListItemObject },
        },
        required: ['success', 'context', 'organizations', 'locations'],
      },
    })),
]

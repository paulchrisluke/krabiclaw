import type { McpToolDefinition } from './shared'
import { globalTool, locationListItemObject, organizationListItemObject, withToolAnnotations, workspaceContextObject } from './shared'

export const CONTEXT_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'get_workspace_context',
      description: "Read the active site and location and the sites available to the signed-in user. Use returned internal organization and location IDs to target site tools. URLs, domains and names are not IDs.",
      domain: 'context',
      minimumRole: 'admin',
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
      description: "Save the selected active site and optional location for this connection. Use internal IDs returned by site/location reads. Explicit IDs supplied to later tools still determine their targets.",
      domain: 'context',
      minimumRole: 'admin',
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

import type { McpToolDefinition } from './shared'
import { siteTool, workRequestObject } from './shared'

export const MANAGED_SERVICE_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_work_requests',
      description: 'List managed-service work requests.',
      domain: 'managed_service',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'managed_service',
      outputSchema: {
        type: 'object',
        properties: { requests: { type: 'array', items: workRequestObject } },
        required: ['requests'],
      },
    }),
  siteTool({
      name: 'create_work_request',
      description: 'Create a managed-service work request.',
      domain: 'managed_service',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'managed_service',
      inputSchema: { type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } },
      required: ['type', 'title'],
      outputSchema: {
        type: 'object',
        properties: workRequestObject.properties,
        required: ['id', 'type', 'title', 'status'],
      },
    }),
]

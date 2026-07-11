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
      inputSchema: {
        type: {
          type: 'string',
          enum: ['content_update', 'menu_update', 'translation', 'seo', 'google_business', 'seasonal', 'photo_update', 'social_media', 'technical', 'other'],
          description: 'Category of work needed.',
        },
        title: { type: 'string', description: 'Short summary of what needs to be done (max 120 chars).' },
        description: { type: 'string', description: 'Full details — what, where, any specific requirements or context.' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'How urgent. Default: normal.',
        },
      },
      required: ['type', 'title'],
      outputSchema: {
        type: 'object',
        properties: workRequestObject.properties,
        required: ['id', 'type', 'title', 'status'],
      },
    }),
]

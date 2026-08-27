import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, siteTool, workRequestObject } from './shared'

export const MANAGED_SERVICE_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_work_requests',
      description: 'List Growth priority-support work requests.',
      domain: 'managed_service',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'managed_service',
      inputSchema: { ...paginationInputSchema },
      outputSchema: {
        type: 'object',
        properties: { requests: { type: 'array', items: workRequestObject }, page_info: pageInfoObject },
        required: ['requests', 'page_info'],
      },
    }),
  siteTool({
      name: 'create_work_request',
      description: 'Create a Growth priority-support work request.',
      domain: 'managed_service',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'managed_service',
      inputSchema: {
        type: {
          type: 'string',
          enum: ['content_update', 'product_update', 'seo', 'google_places', 'seasonal', 'photo_update', 'social_media', 'technical', 'other'],
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

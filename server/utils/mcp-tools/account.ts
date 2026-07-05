import type { McpToolDefinition } from './shared'
import { currentUserObject, globalTool, withToolAnnotations } from './shared'

export const ACCOUNT_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'get_current_user',
      description: 'Get the currently authenticated KrabiClaw account identity for debugging and workflow confirmation.',
      domain: 'account',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: true },
      outputSchema: {
        type: 'object',
        properties: {
          user: currentUserObject,
        },
        required: ['user'],
      },
    })),
]

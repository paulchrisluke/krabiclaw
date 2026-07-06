import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

export const LOCALES_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'list_locales',
      description: 'List enabled locales.',
      domain: 'locales',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          locales: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                locale: { type: 'string', description: 'BCP-47 locale code, e.g. "th", "zh".' },
                is_enabled: { type: 'number' },
                created_at: { type: 'string' },
              },
              required: ['locale'],
            },
          },
        },
        required: ['locales'],
      },
    }),
  siteTool({
      name: 'upsert_locale',
      description: 'Create or update a locale.',
      domain: 'locales',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { locale: { type: 'string' } },
      required: ['locale'],
      outputSchema: {
        type: 'object',
        properties: {
          locale: {
            type: 'object',
            properties: {
              locale: { type: 'string' },
              is_enabled: { type: 'number' },
            },
            required: ['locale'],
          },
        },
        required: ['locale'],
      },
    }),
  siteTool({
      name: 'delete_locale',
      description: 'Delete a locale.',
      domain: 'locales',
      minimumRole: 'editor',
      confirmRequired: true,
      inputSchema: { locale: { type: 'string' } },
      required: ['locale'],
      outputSchema: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean' },
          locale: { type: 'string' },
        },
        required: ['deleted'],
      },
    }),
]

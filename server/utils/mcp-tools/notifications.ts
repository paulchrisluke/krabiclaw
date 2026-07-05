import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

export const NOTIFICATIONS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_notification_settings',
      description: 'Get notification settings.',
      domain: 'notifications',
      minimumRole: 'admin',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          notifications: {
            type: 'object',
            properties: {
              whatsapp_phone: { type: ['string', 'null'] },
              channels: {
                type: 'array',
                items: { type: 'string', enum: ['email', 'whatsapp'] },
              },
            },
            required: ['whatsapp_phone', 'channels'],
          },
        },
        required: ['notifications'],
      },
    }),
  siteTool({
      name: 'update_notification_settings',
      description: 'Update notification settings.',
      domain: 'notifications',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        whatsapp_phone: { type: ['string', 'null'], description: 'Site-level WhatsApp number for owner alerts. Omit to leave unchanged.' },
        channels: {
          type: 'array',
          items: { type: 'string', enum: ['email', 'whatsapp'] },
          description: 'Owner alert channels. Use one or both of email and whatsapp.',
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          notifications: {
            type: 'object',
            properties: {
              whatsapp_phone: { type: ['string', 'null'] },
              channels: {
                type: 'array',
                items: { type: 'string', enum: ['email', 'whatsapp'] },
              },
            },
            required: ['whatsapp_phone', 'channels'],
          },
        },
        required: ['notifications'],
      },
    }),
]

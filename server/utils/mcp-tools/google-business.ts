import type { McpToolDefinition } from './shared'
import { locationObject, siteTool } from './shared'

export const GOOGLE_BUSINESS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_google_business_connection',
      description: 'Get a location Google Business connection.',
      domain: 'google_business',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'google_business',
      inputSchema: { location_id: { type: 'string' } },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: {
          connection: {
            type: 'object',
            properties: {
              connected: { type: 'boolean' },
              account_id: { type: ['string', 'null'] },
              gmb_location_id: { type: ['string', 'null'] },
              location_name: { type: ['string', 'null'] },
              last_synced_at: { type: ['string', 'null'] },
            },
            required: ['connected'],
          },
        },
        required: ['connection'],
      },
    }),
  siteTool({
      name: 'get_google_business_auth_url',
      description: 'Start Google Business auth for a location.',
      domain: 'google_business',
      minimumRole: 'owner',
      confirmRequired: false,
      requiredEntitlement: 'google_business',
      inputSchema: { location_id: { type: 'string' } },
      required: ['location_id'],
      outputSchema: {
        type: 'object',
        properties: {
          authUrl: { type: 'string', description: 'Google OAuth URL — direct the user to open this in a browser.' },
        },
        required: ['authUrl'],
      },
    }),
  siteTool({
      name: 'list_google_business_accounts',
      description: 'List connected Google Business accounts and locations.',
      domain: 'google_business',
      minimumRole: 'editor',
      confirmRequired: false,
      requiredEntitlement: 'google_business',
      outputSchema: {
        type: 'object',
        properties: {
          accounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                locations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      address: { type: 'string' },
                    },
                    required: ['id', 'name'],
                  },
                },
              },
              required: ['id', 'name'],
            },
          },
        },
        required: ['accounts'],
      },
    }),
  siteTool({
      name: 'sync_google_business_locations',
      description: 'Sync selected Google Business locations into the site.',
      domain: 'google_business',
      minimumRole: 'owner',
      confirmRequired: true,
      requiredEntitlement: 'google_business',
      inputSchema: { account_id: { type: 'string' }, location_ids: { type: 'array' } },
      required: ['account_id', 'location_ids'],
      outputSchema: {
        type: 'object',
        properties: {
          synced: { type: 'number', description: 'Number of locations synced.' },
          locations: { type: 'array', items: locationObject },
        },
        required: ['synced'],
      },
    }),
]

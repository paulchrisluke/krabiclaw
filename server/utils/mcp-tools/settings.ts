import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'
import { DASHBOARD_DESTINATIONS } from '~/server/utils/dashboard-links'

export const SETTINGS_TOOLS: McpToolDefinition[] = [
  siteTool({
      name: 'get_dashboard_link',
      description: 'Resolve a deep link into this site\'s org dashboard for a given destination, so a reply can point the user straight at the right settings page instead of just naming it.',
      domain: 'settings',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        destination: {
          type: 'string',
          enum: Object.keys(DASHBOARD_DESTINATIONS),
          description: 'Which dashboard page to link to.',
        },
        location_slug: {
          type: 'string',
          description: 'Required for location.overview and location.settings destinations.',
        },
      },
      required: ['destination'],
      outputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    }),
  // ─── Domain management ───────────────────────────────────────────────────────
  siteTool({
      name: 'get_site_domains',
      description: 'List all domains (subdomains and custom domains) for the site, including their status and DNS setup instructions.',
      domain: 'settings',
      minimumRole: 'owner',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          domains: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                type: { type: 'string', description: "'subdomain' or 'custom'" },
                role: { type: 'string', description: "'canonical' or 'secondary'" },
                status: { type: 'string', description: "'pending', 'active', 'failed', etc." },
                instructions: { type: 'object', description: 'DNS setup instructions for custom domains.' },
              },
              required: ['id', 'domain', 'type', 'role', 'status'],
            },
          },
        },
        required: ['domains'],
      },
    }),
]

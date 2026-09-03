import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

export const SETTINGS_TOOLS: McpToolDefinition[] = [
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

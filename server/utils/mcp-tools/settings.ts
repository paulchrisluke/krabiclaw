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
  siteTool({
      name: 'create_domain',
      description: 'Add a custom domain to the site. Provisions Cloudflare for SaaS hostnames and returns DNS records the client must add at their registrar. Requires the custom_domains entitlement (Growth plan or higher).',
      domain: 'settings',
      minimumRole: 'owner',
      confirmRequired: true,
      requiredEntitlement: 'custom_domains',
      inputSchema: {
        domain: { type: 'string', description: 'Custom domain to add, e.g. "www.example.com" or "example.com".' },
        include_www: { type: 'boolean', description: 'If true (default), provision both www and the apex domain as a pair.' },
      },
      required: ['domain'],
      outputSchema: {
        type: 'object',
        properties: {
          domains: {
            type: 'array',
            description: 'Newly created domain records (www + apex pair).',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                role: { type: 'string' },
                status: { type: 'string' },
                instructions: { type: 'object', description: 'DNS records to add at the registrar.' },
              },
              required: ['id', 'domain', 'role', 'status'],
            },
          },
        },
        required: ['domains'],
      },
    }),
  siteTool({
      name: 'set_canonical_domain',
      description: 'Make an active custom domain the canonical (primary) URL for the site. All other domains become secondary redirects.',
      domain: 'settings',
      minimumRole: 'owner',
      confirmRequired: true,
      inputSchema: {
        domain_id: { type: 'string', description: 'ID of the domain to promote to canonical.' },
      },
      required: ['domain_id'],
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          domain: { type: 'string' },
          role: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['id', 'domain', 'role', 'status'],
      },
    }),
  siteTool({
      name: 'delete_domain',
      description: 'Remove a custom domain from the site and deprovision it from Cloudflare. Cannot delete subdomain entries.',
      domain: 'settings',
      minimumRole: 'owner',
      confirmRequired: true,
      inputSchema: {
        domain_id: { type: 'string', description: 'ID of the custom domain to delete.' },
      },
      required: ['domain_id'],
      outputSchema: {
        type: 'object',
        properties: { deleted: { type: 'boolean' }, domain_id: { type: 'string' } },
        required: ['deleted', 'domain_id'],
      },
    }),
  siteTool({
      name: 'sync_domain',
      description: 'Refresh the SSL/DNS status for a custom domain by re-querying Cloudflare. Use this after the client adds DNS records to check if the domain is now active.',
      domain: 'settings',
      minimumRole: 'owner',
      confirmRequired: false,
      inputSchema: {
        domain_id: { type: 'string', description: 'ID of the domain to sync.' },
      },
      required: ['domain_id'],
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          domain: { type: 'string' },
          status: { type: 'string' },
          ssl_status: { type: 'string' },
          dns_status: { type: 'string' },
          instructions: { type: 'object' },
        },
        required: ['id', 'domain', 'status'],
      },
    }),
]

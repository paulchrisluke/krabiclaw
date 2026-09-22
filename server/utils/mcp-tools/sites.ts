import type { McpToolDefinition } from './shared'
import { ROBOTS_DIRECTIVE_ENUM, SUPPORTED_CURRENCIES, currentUserObject, globalTool, pageInfoObject, paginationInputSchema, organizationSummaryItem, siteTool, withToolAnnotations } from './shared'

const SITE_MEDIA_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    asset_id: { type: 'string' },
    slot: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    kind: { type: 'string' },
  },
  required: ['asset_id', 'slot', 'public_url', 'thumbnail_url', 'kind'],
} as const

export const SITES_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'list_organizations',
      description: 'List the organizations the caller can reach and the current authenticated account identity. Use this to choose the internal organization id for organization_id. If the user provides a public URL, hostname, custom domain, subdomain, slug, or business name, match it against the returned organizations and pass the matching id as organization_id; never pass the URL/domain/name itself as organization_id.',
      domain: 'sites',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: { type: 'object', properties: { ...paginationInputSchema }, additionalProperties: true },
      outputSchema: {
        type: 'object',
        properties: {
          organizations: {
            type: 'array',
            items: organizationSummaryItem,
          },
          currentUser: currentUserObject,
          page_info: pageInfoObject,
        },
        required: ['organizations', 'currentUser', 'page_info'],
      },
    })),
  siteTool({
      name: 'get_organization',
      description: 'Get site details for an internal KrabiClaw organization_id. Do not pass a public URL, hostname, custom domain, subdomain, slug, or business name as organization_id; call get_workspace_context or list_organizations first and use the returned id.',
      domain: 'sites',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          site: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              subdomain: { type: 'string' },
              theme: { type: 'string' },
              status: { type: 'string' },
              name: { type: ['string', 'null'] },
              brand_description: { type: ['string', 'null'] },
              media: { type: 'array', items: SITE_MEDIA_ITEM_SCHEMA },
              public_url: { type: ['string', 'null'] },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
            required: ['id', 'subdomain', 'status'],
          },
        },
        required: ['site'],
      },
    }),
  siteTool({
      name: 'get_organization_settings',
      description: 'Get editable site settings for an internal KrabiClaw organization_id. Do not pass a public URL, hostname, custom domain, subdomain, slug, or business name as organization_id; call get_workspace_context or list_organizations first and use the returned id.',
      domain: 'sites',
      minimumRole: 'editor',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          settings: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              subdomain: { type: 'string' },
              theme: { type: 'string' },
              status: { type: 'string' },
              public_url: { type: ['string', 'null'] },
              custom_domain_status: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
              brand_description: { type: ['string', 'null'] },
              media: { type: 'array', items: SITE_MEDIA_ITEM_SCHEMA },
              contact_email: { type: ['string', 'null'] },
              default_currency: { type: ['string', 'null'] },
              press_email: { type: ['string', 'null'] },
              partnerships_email: { type: ['string', 'null'] },
              catering_email: { type: ['string', 'null'] },
              careers_email: { type: ['string', 'null'] },
              google_analytics_measurement_id: { type: ['string', 'null'] },
              seo_title: { type: ['string', 'null'] },
              seo_description: { type: ['string', 'null'] },
              canonical_url: { type: ['string', 'null'] },
              robots: { type: ['string', 'null'] },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
            required: ['id', 'subdomain'],
          },
        },
        required: ['settings'],
      },
    }),
  siteTool({
      name: 'update_organization_settings',
      description: 'Update editable site settings such as brand name, description, logo, contact email, currency, analytics IDs, and search defaults. For brand color changes, use the dedicated set_brand_color tool instead of this generic settings tool.',
      domain: 'sites',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        name: { type: 'string' },
        brand_description: { type: 'string' },
        media: {
          type: 'array',
          items: {
            type: 'object',
            properties: { asset_id: { type: 'string' }, slot: { type: 'string', enum: ['logo', 'favicon'] } },
            required: ['asset_id', 'slot'],
          },
        },
        contact_email: { type: ['string', 'null'], description: 'Public contact email shown to guests. Pass null to clear it.' },
        default_currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
        press_email: { type: 'string' },
        partnerships_email: { type: 'string' },
        catering_email: { type: 'string' },
        careers_email: { type: 'string' },
        seo_title: { type: ['string', 'null'], description: 'Optional site-wide default SEO title override for the homepage and any page without its own override. Falls back to name if unset.' },
        seo_description: { type: ['string', 'null'], description: 'Optional site-wide default SEO description override. Falls back to brand_description if unset.' },
        canonical_url: { type: ['string', 'null'], description: 'Optional site-wide canonical URL override for the homepage.' },
        robots: { type: ['string', 'null'], enum: [...ROBOTS_DIRECTIVE_ENUM, null], description: 'Search engine indexing directive for the homepage. Leave unset for the default index,follow.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entity: { type: 'string', enum: ['site_settings'] },
          id: { type: 'string' },
          changed_fields: { type: 'array', items: { type: 'string' } },
          updated_at: { type: 'string' },
          context: { type: 'object' },
        },
        required: ['ok', 'entity', 'id'],
      },
    }),
  siteTool({
      name: 'set_default_currency',
      description: 'Set the default currency for this site. Affects how Product and experience prices are displayed.',
      domain: 'sites',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES], description: 'ISO 4217 currency code.' },
      },
      required: ['currency'],
      outputSchema: {
        type: 'object',
        properties: {
          default_currency: { type: 'string' },
          updated: { type: 'boolean' },
        },
        required: ['default_currency', 'updated'],
      },
    }),
  siteTool({
      name: 'set_brand_color',
      description: 'Set the brand color theme for the site. Use this tool for any accent-color or theme-color change. Accepts natural language color descriptions like "earthy", "warm terracotta", "ocean blue", "sage green", or hex codes like #8F1D21. The brand color controls the primary accent color across the Saya template (buttons, links, highlights).',
      domain: 'sites',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        color: { type: 'string', description: 'Color description in natural language (e.g., "earthy", "warm terracotta", "ocean blue") or hex format (e.g., #8F1D21).' },
      },
      required: ['color'],
      outputSchema: {
        type: 'object',
        properties: {
          brand_color: { type: 'string', description: 'The resolved hex color code that was set.' },
          updated: { type: 'boolean' },
          description: { type: 'string', description: 'Human-readable description of what color was set.' },
        },
        required: ['brand_color', 'updated', 'description'],
      },
    }),
]

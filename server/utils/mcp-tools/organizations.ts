import type { McpToolDefinition } from './shared'
import { SUPPORTED_CURRENCIES, currentUserObject, globalTool, pageInfoObject, paginationInputSchema, organizationSummaryItem, organizationTool, withToolAnnotations } from './shared'

const ORGANIZATION_MEDIA_ITEM_SCHEMA = {
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

const ANNOUNCEMENT_SCHEMA = {
  type: ['object', 'null'],
  description: 'The universal announcement modal shown to visitors on the public website, available to every theme. An image, when set, is a separate organization media placement (slot "announcement"), not a field here.',
  properties: {
    headline: { type: 'string', description: 'Required in every write, even an empty string when disabling without discarding it.' },
    description: { type: ['string', 'null'] },
    cta_label: { type: ['string', 'null'], description: 'Button label. Requires cta_url and vice versa.' },
    cta_url: { type: ['string', 'null'], description: 'Button destination, http or https. Requires cta_label and vice versa.' },
    dismissible: { type: 'boolean', description: 'Whether a visitor who closes it will not be shown it again on that device.' },
    enabled: { type: 'boolean', description: 'Whether the announcement is currently shown. false keeps the saved content without showing it.' },
  },
} as const

export const ORGANIZATIONS_TOOLS: McpToolDefinition[] = [
  globalTool(withToolAnnotations({
      name: 'list_organizations',
      description: 'List the organizations the caller can reach and the current authenticated account identity. Use this to choose the internal organization id for organization_id. If the user provides a public URL, hostname, custom domain, subdomain, slug, or business name, match it against the returned organizations and pass the matching id as organization_id; never pass the URL/domain/name itself as organization_id.',
      domain: 'organizations',
      minimumRole: 'admin',
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
  organizationTool({
      name: 'get_organization',
      description: 'Get site details for an internal KrabiClaw organization_id. Do not pass a public URL, hostname, custom domain, subdomain, slug, or business name as organization_id; call get_workspace_context or list_organizations first and use the returned id.',
      domain: 'organizations',
      minimumRole: 'admin',
      confirmRequired: false,
      outputSchema: {
        type: 'object',
        properties: {
          organization: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              subdomain: { type: 'string' },
              theme: { type: 'string' },
              status: { type: 'string' },
              name: { type: ['string', 'null'] },
              brand_description: { type: ['string', 'null'] },
              media: { type: 'array', items: ORGANIZATION_MEDIA_ITEM_SCHEMA },
              public_url: { type: ['string', 'null'] },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
            required: ['id', 'subdomain', 'status'],
          },
        },
        required: ['organization'],
      },
    }),
  organizationTool({
      name: 'get_organization_settings',
      description: 'Get editable organization settings for an internal KrabiClaw organization_id. Do not pass a public URL, hostname, custom domain, subdomain, slug, or business name as organization_id; call get_workspace_context or list_organizations first and use the returned id.',
      domain: 'organizations',
      minimumRole: 'admin',
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
              announcement: ANNOUNCEMENT_SCHEMA,
              media: { type: 'array', items: ORGANIZATION_MEDIA_ITEM_SCHEMA },
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
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
            required: ['id', 'subdomain'],
          },
        },
        required: ['settings'],
      },
    }),
  organizationTool({
      name: 'update_organization_settings',
      description: 'Update editable organization settings such as brand name, description, the announcement modal, contact email, currency, and website status (Live or Draft). announcement is a full replacement of the announcement (every field together); pass null to remove it entirely. The announcement image and the logo are each an organization media placement, set with set_media (slots "announcement" and "logo"). For brand color changes, use the dedicated set_brand_color tool instead of this generic settings tool.',
      domain: 'organizations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        name: { type: 'string' },
        brand_description: { type: 'string' },
        announcement: ANNOUNCEMENT_SCHEMA,
        contact_email: { type: ['string', 'null'], description: 'Public contact email shown to guests. Pass null to clear it.' },
        default_currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
        status: { type: 'string', enum: ['active', 'inactive'], description: 'Website status: active is Live (public and indexable), inactive is Draft (preview only). A suspended website cannot be changed.' },
        press_email: { type: 'string' },
        partnerships_email: { type: 'string' },
        catering_email: { type: 'string' },
        careers_email: { type: 'string' },
        seo_title: { type: ['string', 'null'], description: 'Optional site-wide default SEO title override for the homepage and any page without its own override. Falls back to name if unset.' },
        seo_description: { type: ['string', 'null'], description: 'Optional site-wide default SEO description override. Falls back to brand_description if unset.' },
        canonical_url: { type: ['string', 'null'], description: 'Optional site-wide canonical URL override for the homepage.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          entity: { type: 'string', enum: ['organization_settings'] },
          id: { type: 'string' },
          changed_fields: { type: 'array', items: { type: 'string' } },
          updated_at: { type: 'string' },
          context: { type: 'object' },
        },
        required: ['ok', 'entity', 'id'],
      },
    }),
  organizationTool({
      name: 'set_consultation_mode',
      description: 'Set the existing site consultation mode through the same writer as the CMS. Native uses published online Products and the existing service pages; external_url requires a configured external destination. This does not configure providers, pricing, payment capture or a commercial plan.',
      domain: 'organizations', minimumRole: 'admin', confirmRequired: false,
      inputSchema: { mode: { type: 'string', enum: ['native', 'external_url', 'native_disabled'] } },
      required: ['mode'],
      outputSchema: { type: 'object', properties: { settings: { type: 'object', properties: { mode: { type: 'string', enum: ['native', 'external_url', 'native_disabled'] } }, required: ['mode'] } }, required: ['settings'] },
    }),
  organizationTool({
      name: 'set_default_currency',
      description: 'Set the default currency for this organization. Existing clients may continue using this tool; prefer update_organization_settings.default_currency for new integrations. Both use the same settings writer. Affects how Product and experience prices are displayed.',
      domain: 'organizations',
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
  organizationTool({
      name: 'set_brand_color',
      description: 'Set the brand color theme for the site. Use this tool for any accent-color or theme-color change. Accepts natural language color descriptions like "earthy", "warm terracotta", "ocean blue", "sage green", or hex codes like #8F1D21. The brand color controls the primary accent color across the Saya template (buttons, links, highlights).',
      domain: 'organizations',
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

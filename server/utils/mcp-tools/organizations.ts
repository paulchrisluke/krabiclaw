import type { McpToolDefinition } from './shared'
import { SUPPORTED_CURRENCIES, currentUserObject, globalTool, pageInfoObject, paginationInputSchema, organizationSummaryItem, organizationTool, withToolAnnotations } from './shared'
import { setPublicConsultationMode } from '~/server/utils/professional-services'
import type { McpExecutorContext } from './execution'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getOrganizationForMcp } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { loadSettingsPayload, updateOrganizationSettingsFields } from '~/server/utils/organization-settings'
import { ORGANIZATION_FONT_OPTIONS, ORGANIZATION_FONT_PRESETS } from '~/shared/organization-fonts'
import { SITE_PALETTE_ROLES, STARTER_PALETTES, paletteContrast, type SitePalette, type SitePalettePatch } from '~/shared/site-palette'
import { resolveColor } from '~/utils/color-utils'

const PALETTE_COLORS_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(SITE_PALETTE_ROLES.map(entry => [entry.role, { type: 'string', description: entry.rule }])),
  additionalProperties: false,
} as const
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, requiredString, workspaceContextPayload } from './execution'

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
      description: "List sites available to the signed-in user and the current account identity. Match the requested site against these results and use its internal ID; a public URL, domain or business name is not an organization_id.",
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
      description: "Read the selected KrabiClaw site’s identity, public address and settings. organization_id is the internal ID returned by get_workspace_context or list_organizations, not a URL, domain or business name.",
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
      description: "Read editable settings for the selected KrabiClaw site. Use its internal organization_id from get_workspace_context or list_organizations, not its public URL, domain or name.",
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
              font_preset: { type: 'string', enum: [...ORGANIZATION_FONT_PRESETS] },
              palette: { type: ['object', 'null'], description: 'The colors the site renders, light and dark: its own, or its template\'s. Null on the platform template.', properties: { light: PALETTE_COLORS_SCHEMA, dark: PALETTE_COLORS_SCHEMA } },
              palette_source: { type: ['string', 'null'], enum: ['custom', 'template', null] },
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
      description: "Change the selected site’s brand, description, website font, colors, contact email, default currency, visitor announcement popup or Live/Draft status. Only supplied settings change. An announcement replaces all its fields, and null removes it. Logos and announcement images are separate media placements; this tool does not change them. Returns the updated settings. Published website settings change immediately; this does not create a short post, blog article or social publication.",
      domain: 'organizations',
      minimumRole: 'admin',
      confirmRequired: true,
      inputSchema: {
        name: { type: 'string' },
        brand_description: { type: 'string' },
        font_preset: { type: 'string', enum: [...ORGANIZATION_FONT_PRESETS], description: `Website heading and body fonts, on every template: ${ORGANIZATION_FONT_OPTIONS.map(option => `${option.value} (${option.label})`).join(', ')}. Thai, Vietnamese and Japanese text renders in every choice.` },
        palette: {
          type: ['object', 'null'],
          description: `Saya and Blawby website colors, each with a light and a dark value. Roles: ${SITE_PALETTE_ROLES.map(entry => `${entry.role} (${entry.rule})`).join(' ')} Start from a starter (${STARTER_PALETTES.map(entry => entry.id).join(', ')}) and/or name only the roles to change; colors are #RRGGBB or a plain description such as "forest green". Borders and tints are derived. null returns to the template's colors. The result reports any text or button pair below WCAG AA contrast.`,
          properties: {
            starter: { type: 'string', enum: STARTER_PALETTES.map(entry => entry.id) },
            light: PALETTE_COLORS_SCHEMA,
            dark: PALETTE_COLORS_SCHEMA,
          },
          additionalProperties: false,
        },
        announcement: ANNOUNCEMENT_SCHEMA,
        contact_email: { type: ['string', 'null'], description: 'Public contact email shown to guests. Pass null to clear it.' },
        default_currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES], description: 'ISO 4217 code. Existing prices keep their stored currency and amount; nothing is converted.' },
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
          contrast_warnings: { type: 'array', items: { type: 'object', properties: { mode: { type: 'string' }, pair: { type: 'string' }, ratio: { type: 'number' }, minimum: { type: 'number' } }, required: ['mode', 'pair', 'ratio', 'minimum'] } },
          updated_at: { type: 'string' },
          context: { type: 'object' },
        },
        required: ['ok', 'entity', 'id'],
      },
    }),
  organizationTool({
      name: 'set_consultation_mode',
      description: 'Set how the selected website offers consultations when the user wants to enable website booking, use an external scheduler or disable booking. Native booking uses published online products linked to service pages. External scheduling requires an existing configured URL. Does not set prices or connect a calendar or payment provider.',
      domain: 'organizations', minimumRole: 'admin', confirmRequired: false,
      inputSchema: { mode: { type: 'string', enum: ['native', 'external_url', 'native_disabled'] } },
      required: ['mode'],
      outputSchema: { type: 'object', properties: { settings: { type: 'object', properties: { mode: { type: 'string', enum: ['native', 'external_url', 'native_disabled'] } }, required: ['mode'] } }, required: ['settings'] },
    }),
]

// MCP callers may describe a color in words; the stored palette holds hex only.
function resolvePaletteColorNames(patch: SitePalettePatch): SitePalettePatch {
  const resolveMode = (colors: SitePalettePatch['light']) => colors && Object.fromEntries(Object.entries(colors).map(([role, value]) => {
    const resolved = typeof value === 'string' ? resolveColor(value) : null
    if (!resolved) throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported color for ${role}: ${String(value)}`)
    return [role, resolved]
  }))
  return { ...patch, ...(patch.light && { light: resolveMode(patch.light) }), ...(patch.dark && { dark: resolveMode(patch.dark) }) }
}

export async function handleOrganizationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "get_organization":
      {
        const organizationRecord = await getOrganizationForMcp(
          organization.db,
          organization.env,
          organization.organizationId,
          organization.userId,
        );
        const workspace = await resolveMcpWorkspace(
          organization.db,
          organization.env,
          organization.userId,
          { organizationId: organization.organizationId },
        );
        return {
          organization: organizationRecord,
          context: workspaceContextPayload(workspace.organization, workspace.location),
        };
      }
    case "get_organization_settings":
      return {
        settings: await loadSettingsPayload(
          organization.db,
          organization.organizationId,

        ),
      };
    case "update_organization_settings": {
      const updates = { ...args } as Record<
        string,
        unknown
      >;
      if (updates.palette && typeof updates.palette === 'object') updates.palette = resolvePaletteColorNames(updates.palette as SitePalettePatch);
      const result = await updateOrganizationSettingsFields(
        organization.db,
        organization.env,
        organization.organizationId,
        updates,
        organization.userId
      );
      assertDomainSuccess(result);
      const settingsResult = (result.data as { settings: { updated_at: string; palette: SitePalette | null } }).settings;
      const updateSettingsContext = await mutationContextPayload(organization);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "organization_settings",
          id: organization.organizationId,
          changed_fields: Object.keys(updates),
          contrast_warnings: settingsResult.palette ? paletteContrast(settingsResult.palette).filter(check => check.ratio < check.minimum) : [],
          updated_at: settingsResult.updated_at,
          context: updateSettingsContext,
        },
        "Updated organization settings.",
        { settings: settingsResult },
      );
    }
    case "set_consultation_mode":
      return { settings: await setPublicConsultationMode(organization.db, organization.organizationId, requiredString(args, 'mode') as 'native' | 'external_url' | 'native_disabled') }
    default:
      return NOT_HANDLED
  }
}

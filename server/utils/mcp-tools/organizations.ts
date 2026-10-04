import type { McpToolDefinition } from './shared'
import { SUPPORTED_CURRENCIES, currentUserObject, globalTool, pageInfoObject, paginationInputSchema, organizationSummaryItem, organizationTool, withToolAnnotations } from './shared'
import { setPublicConsultationMode } from '~/server/utils/professional-services'
import type { McpExecutorContext } from './execution'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getOrganizationForMcp } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { loadSettingsPayload, updateOrganizationSettingsFields } from '~/server/utils/organization-settings'
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
      description: "Change the selected site’s brand, description, contact email, default currency, announcement or Live/Draft status. Only supplied settings change. An announcement replaces all its fields, and null removes it. Logos and announcement images are separate media placements; this tool does not change them.",
      domain: 'organizations',
      minimumRole: 'admin',
      confirmRequired: false,
      inputSchema: {
        name: { type: 'string' },
        brand_description: { type: 'string' },
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
  organizationTool({
      name: 'set_brand_color',
      description: "Set the selected site’s brand accent color from a color description or hex value. Applies to Saya theme accents such as buttons, links and highlights; it does not change layout or other template settings.",
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
      const updates = args as Record<
        string,
        unknown
      >;
      const result = await updateOrganizationSettingsFields(
        organization.db,
        organization.env,
        organization.organizationId,
        updates,
        organization.userId
      );
      assertDomainSuccess(result);
      const settingsResult = (result.data as { settings: { updated_at: string } }).settings;
      const updateSettingsContext = await mutationContextPayload(organization);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "organization_settings",
          id: organization.organizationId,
          changed_fields: Object.keys(updates),
          updated_at: settingsResult.updated_at,
          context: updateSettingsContext,
        },
        "Updated organization settings.",
        { settings: settingsResult },
      );
    }
    case "set_consultation_mode":
      return { settings: await setPublicConsultationMode(organization.db, organization.organizationId, requiredString(args, 'mode') as 'native' | 'external_url' | 'native_disabled') }
    case "set_brand_color": {
      const { resolveColor } = await import("~/utils/color-utils");
      const colorInput = requiredString(args, "color");
      const resolvedColor = resolveColor(colorInput);
      if (!resolvedColor) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported color: ${colorInput}`);
      }
      const result = await updateOrganizationSettingsFields(
        organization.db,
        organization.env,
        organization.organizationId,
        { brand_color: resolvedColor },
        organization.userId,
      );
      assertDomainSuccess(result);
      return {
        brand_color: resolvedColor,
        updated: true,
        description: `Set brand color to ${resolvedColor} from "${colorInput}"`,
        context: await mutationContextPayload(organization),
      };
    }
    default:
      return NOT_HANDLED
  }
}

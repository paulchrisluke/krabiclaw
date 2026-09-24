import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getOrganizationForMcp } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { loadSettingsPayload, updateOrganizationSettingsFields } from '~/server/utils/organization-settings'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, requiredString, workspaceContextPayload } from './shared'

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
      const settingsResult = result.data as { updated_at: string };
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
    case "set_default_currency": {
      const { isCurrencyCode } = await import("~/shared/currencies");
      const currency = requiredString(args, "currency").toUpperCase().trim();
      if (!isCurrencyCode(currency)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported currency: ${currency}`);
      }
      const result = await updateOrganizationSettingsFields(
        organization.db,
        organization.env,
        organization.organizationId,
        { default_currency: currency },
        organization.userId,
      );
      assertDomainSuccess(result);
      return {
        default_currency: currency,
        updated: true,
        context: await mutationContextPayload(organization),
      };
    }
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

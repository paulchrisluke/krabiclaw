import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getSiteForMcp } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { NOT_HANDLED, assertDomainSuccess, loadSiteSettings, mutationContextPayload, requireActiveImageAsset, requiredString, workspaceContextPayload } from './shared'

export async function handleSitesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_site":
      {
        const siteRecord = await getSiteForMcp(
          site.db,
          site.siteId,
          site.userId,
          site.isPlatformAdmin,
        );
        const workspace = await resolveMcpWorkspace(
          site.db,
          site.userId,
          site.isPlatformAdmin,
          { siteId: site.siteId },
        );
        return {
          site: siteRecord,
          context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location, site.env),
        };
      }
    case "get_site_settings":
      return {
        settings: await loadSiteSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_site_settings": {
      const { forceSubdomainRegistrationFailure, ...updates } = args as Record<
        string,
        unknown
      >;
      const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true';
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        updates,
        site.userId,
        {
          forceSubdomainRegistrationFailure: e2eOverride && Boolean(
            forceSubdomainRegistrationFailure,
          ),
        },
      );
      assertDomainSuccess(result);
      const settingsResult = result.data as { updated_at: string };
      const updateSettingsContext = await mutationContextPayload(site);
      return renderStructuredResponse(
        {
          ok: true,
          entity: "site_settings",
          id: site.siteId,
          changed_fields: Object.keys(updates),
          updated_at: settingsResult.updated_at,
          context: updateSettingsContext,
        },
        "Updated site settings.",
        { settings: settingsResult },
      );
    }
    case "set_default_currency": {
      const { isCurrencyCode } = await import("~/shared/currencies");
      const currency = String(args.currency ?? "").toUpperCase().trim();
      if (!isCurrencyCode(currency)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported currency: ${currency}`);
      }
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { default_currency: currency },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        default_currency: currency,
        updated: true,
        context: await mutationContextPayload(site),
      };
    }
    case "set_logo": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { logo_asset_id: assetId },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        id: site.siteId,
        updated: true,
        logo_asset_id: assetId,
        context: await mutationContextPayload(site),
      };
    }
    case "set_brand_color": {
      const { resolveColor } = await import("~/utils/color-utils");
      const colorInput = requiredString(args, "color");
      const resolvedColor = resolveColor(colorInput);
      if (!resolvedColor) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported color: ${colorInput}`);
      }
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { brand_color: resolvedColor },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        brand_color: resolvedColor,
        updated: true,
        description: `Set brand color to ${resolvedColor} from "${colorInput}"`,
        context: await mutationContextPayload(site),
      };
    }
    default:
      return NOT_HANDLED
  }
}

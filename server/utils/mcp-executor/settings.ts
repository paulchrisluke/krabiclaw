import type { McpExecutorContext } from './shared'
import { DASHBOARD_DESTINATIONS, buildDashboardUrl, type DashboardDestination } from '~/server/utils/dashboard-links'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { domainInstructions, getSiteDomains } from '~/server/utils/domain-read-model'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

export async function handleSettingsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "get_dashboard_link": {
      const destination = requiredString(args, "destination") as DashboardDestination;
      if (!Object.prototype.hasOwnProperty.call(DASHBOARD_DESTINATIONS, destination)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Unknown destination "${destination}". Valid destinations: ${Object.keys(DASHBOARD_DESTINATIONS).join(", ")}`,
        );
      }
      const locationSlug = destination.startsWith('location.')
        ? requiredString(args, "location_slug")
        : typeof args.location_slug === 'string' ? args.location_slug.trim() || null : null;
      return { url: buildDashboardUrl({ ...site, locationSlug }, destination) };
    }
    case "get_site_domains": {
      const domains = await getSiteDomains(site.db, site.siteId);
      return {
        domains: domains.map((d) => ({
          id: d.id,
          domain: d.domain,
          type: d.type,
          role: d.role,
          status: d.status,
          instructions: domainInstructions(d),
        })),
      };
    }
    // ─── Analytics ──────────────────────────────────────────────────────────
    default:
      return NOT_HANDLED
  }
}

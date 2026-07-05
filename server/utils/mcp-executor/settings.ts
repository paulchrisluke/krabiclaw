import type { McpExecutorContext } from './shared'
import { DASHBOARD_DESTINATIONS, buildDashboardUrl, type DashboardDestination } from '~/server/utils/dashboard-links'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createCustomDomainPair, deleteCustomDomain, domainInstructions, getSiteDomains, hasCustomDomainsEntitlement, setCanonicalDomain, syncDomainWithCloudflare, validateCustomDomain } from '~/server/utils/domains'
import { createError } from 'h3'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

export async function handleSettingsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "get_dashboard_link": {
      const destination = requiredString(args, "destination") as DashboardDestination;
      if (!Object.prototype.hasOwnProperty.call(DASHBOARD_DESTINATIONS, destination)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Unknown destination "${destination}". Valid destinations: ${Object.keys(DASHBOARD_DESTINATIONS).join(", ")}`,
        );
      }
      return { url: buildDashboardUrl(site, destination) };
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
    case "create_domain": {
      const hasEntitlement = await hasCustomDomainsEntitlement(
        site.db,
        site.siteId,
      );
      if (!hasEntitlement) {
        throw createError({
          statusCode: 403,
          statusMessage: "Custom domains require the Growth plan or higher.",
        });
      }
      const domain = requiredString(args, "domain");
      const includeWww = args.include_www !== false;
      const validation = validateCustomDomain(
        site.env as Parameters<typeof validateCustomDomain>[0],
        domain,
      );
      if (!validation.valid) {
        throw createError({
          statusCode: 400,
          statusMessage: validation.reason ?? "Invalid domain",
        });
      }
      const records = await createCustomDomainPair(
        site.env as Parameters<typeof createCustomDomainPair>[0],
        site.db,
        {
          siteId: site.siteId,
          organizationId: site.organizationId,
          domain,
          includeWww,
          actorId: site.userId,
          actorType: "owner",
        },
      );
      return {
        domains: records.map((d) => ({
          id: d.id,
          domain: d.domain,
          role: d.role,
          status: d.status,
          instructions: domainInstructions(d),
        })),
        context: await mutationContextPayload(site),
      };
    }
    case "set_canonical_domain": {
      const domainId = requiredString(args, "domain_id");
      const record = await setCanonicalDomain(
        site.db,
        site.siteId,
        domainId,
        "owner",
        site.userId,
      );
      return {
        id: record.id,
        domain: record.domain,
        role: record.role,
        status: record.status,
        context: await mutationContextPayload(site),
      };
    }
    case "delete_domain": {
      const domainId = requiredString(args, "domain_id");
      await deleteCustomDomain(
        site.env as Parameters<typeof deleteCustomDomain>[0],
        site.db,
        domainId,
        "owner",
        site.userId,
      );
      return { deleted: true, domain_id: domainId, context: await mutationContextPayload(site) };
    }
    case "sync_domain": {
      const domainId = requiredString(args, "domain_id");
      const record = await syncDomainWithCloudflare(
        site.env as Parameters<typeof syncDomainWithCloudflare>[0],
        site.db,
        domainId,
        "owner",
        site.userId,
      );
      return {
        id: record.id,
        domain: record.domain,
        status: record.status,
        ssl_status: record.cloudflare_ssl_status ?? null,
        dns_status: record.dns_status ?? null,
        instructions: domainInstructions(record),
        context: await mutationContextPayload(site),
      };
    }
    // ─── Analytics ──────────────────────────────────────────────────────────
    default:
      return NOT_HANDLED
  }
}

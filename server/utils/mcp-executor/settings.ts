import type { McpExecutorContext } from './shared'
import { domainInstructions, getSiteDomains } from '~/server/utils/domain-read-model'
import { NOT_HANDLED } from './shared'

export async function handleSettingsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, site } = ctx
  switch (toolName) {
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
    default:
      return NOT_HANDLED
  }
}

import type { McpExecutorContext } from './shared'
import { deleteSiteLocale, listSiteLocales, upsertSiteLocale } from '~/server/utils/site-locales'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

export async function handleLocalesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_locales":
      return await listSiteLocales(site.db, site.organizationId, site.siteId);
    case "upsert_locale":
      {
        const locale = await upsertSiteLocale(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
        );
        return { locale, context: await mutationContextPayload(site) };
      }
    case "delete_locale":
      {
        const result = await deleteSiteLocale(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
    default:
      return NOT_HANDLED
  }
}

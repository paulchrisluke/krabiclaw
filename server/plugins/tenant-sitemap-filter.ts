import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import { queryAll, type DbClient } from '~/server/db'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { definePlugin } from 'nitro';

function pathFromLoc(input: unknown) {
  const loc = typeof input === 'string'
    ? input
    : input && typeof input === 'object' && 'loc' in input
      ? (input as { loc?: unknown }).loc
      : input && typeof input === 'object' && 'url' in input
        ? (input as { url?: unknown }).url
        : ''
  if (typeof loc !== 'string') return ''
  if (loc.startsWith('/')) return loc
  try {
    return new URL(loc).pathname
  } catch {
    return ''
  }
}

async function publishedTenantPagePaths(event: H3Event, db: DbClient | undefined, siteId: string | undefined) {
  if (!db || !siteId) return new Set<string>()
  const rows = await queryAll<{ path: string | null }>(db, `
    SELECT json_extract(r.snapshot_json, '$.metadata.path') AS path
      FROM tenant_page_variants v
      JOIN content_revisions r ON r.id = v.published_revision_id AND r.document_id = v.document_id
     WHERE v.site_id = ? AND v.(scheduled_for IS NULL OR scheduled_for <= datetime('now')) AND v.published_revision_id IS NOT NULL
       AND json_extract(r.snapshot_json, '$.metadata.locale') = v.locale
  `, [siteId])
  return new Set(rows.map(row => row.path).filter((path): path is string => Boolean(path)))
}

function isAllowedTenantPath(event: H3Event, path: string, publishedPaths: Set<string>) {
  const site = event.context.site as { theme?: string | null; vertical?: string | null } | undefined
  const template = resolvePublicTemplate({
    theme: site?.theme,
    themeId: event.context.themeId as string | null | undefined,
    vertical: site?.vertical,
  })
  const exactPaths = new Set(template.sitemap.exactPaths)
  return publishedPaths.has(path) || exactPaths.has(path) || template.sitemap.dynamicPrefixes.some(prefix => path.startsWith(prefix))
}

export default definePlugin((nitroApp) => {
  const filterTenantUrls = async <T>(ctx: { event: H3Event; urls: T[] }) => {
    if (ctx.event.context.tenantType !== TENANT_TYPES.TENANT) return
    const env = cloudflareEnv(ctx.event)
    const publishedPaths = await publishedTenantPagePaths(ctx.event, env.db, ctx.event.context.siteId as string | undefined)
    ctx.urls = ctx.urls.filter((url) => isAllowedTenantPath(ctx.event, pathFromLoc(url), publishedPaths))
  }

  nitroApp.hooks.hook('sitemap:input', async (ctx) => {
    await filterTenantUrls(ctx)
  })

  nitroApp.hooks.hook('sitemap:resolved', async (ctx) => {
    await filterTenantUrls(ctx)
  })
})

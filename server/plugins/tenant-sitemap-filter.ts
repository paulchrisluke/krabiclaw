import type { H3Event } from 'h3'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { TENANT_TYPES } from '~/utils/tenant-routing'

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

function isAllowedTenantPath(event: H3Event, path: string) {
  const site = event.context.site as { theme?: string | null; vertical?: string | null } | undefined
  const template = resolvePublicTemplate({
    theme: site?.theme,
    themeId: event.context.themeId,
    vertical: site?.vertical,
  })
  const exactPaths = new Set(template.sitemap.exactPaths)
  return exactPaths.has(path) || template.sitemap.dynamicPrefixes.some(prefix => path.startsWith(prefix))
}

export default defineNitroPlugin((nitroApp) => {
  const filterTenantUrls = <T>(ctx: { event: H3Event; urls: T[] }) => {
    if (ctx.event.context.tenantType !== TENANT_TYPES.TENANT) return
    ctx.urls = ctx.urls.filter((url) => isAllowedTenantPath(ctx.event, pathFromLoc(url)))
  }

  nitroApp.hooks.hook('sitemap:input', (ctx) => {
    filterTenantUrls(ctx)
  })

  nitroApp.hooks.hook('sitemap:resolved', (ctx) => {
    filterTenantUrls(ctx)
  })
})

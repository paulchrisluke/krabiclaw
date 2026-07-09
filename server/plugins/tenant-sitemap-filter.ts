import type { H3Event } from 'h3'
import { TENANT_TYPES } from '~/utils/tenant-routing'

const BLAWBY_EXACT_PATHS = new Set([
  '/',
  '/about',
  '/services',
  '/pricing',
  '/donate',
  '/schedule',
  '/contact',
  '/blog',
  '/policies/privacy',
  '/policies/terms',
  '/third-party-notices',
])

const SAYA_EXACT_PATHS = new Set([
  '/',
  '/menu',
  '/contact',
  '/blog',
  '/experiences',
  '/locations',
  '/reservations',
  '/posts',
  '/photos',
  '/qa',
  '/reviews',
])

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

function isBlawbyTenant(event: H3Event) {
  const site = event.context.site as { vertical?: string | null } | undefined
  return event.context.themeId === 'blawby-theme-v1' || site?.vertical === 'professional_service'
}

function isAllowedBlawbyPath(path: string) {
  return BLAWBY_EXACT_PATHS.has(path) || path.startsWith('/services/') || path.startsWith('/article/')
}

function isAllowedSayaPath(path: string) {
  return SAYA_EXACT_PATHS.has(path) ||
    path.startsWith('/blog/') ||
    path.startsWith('/experiences/') ||
    path.startsWith('/locations/') ||
    path.startsWith('/posts/')
}

export default defineNitroPlugin((nitroApp) => {
  const filterTenantUrls = <T>(ctx: { event: H3Event; urls: T[] }) => {
    if (ctx.event.context.tenantType !== TENANT_TYPES.TENANT) return
    const allow = isBlawbyTenant(ctx.event) ? isAllowedBlawbyPath : isAllowedSayaPath
    ctx.urls = ctx.urls.filter((url) => allow(pathFromLoc(url)))
  }

  nitroApp.hooks.hook('sitemap:input', (ctx) => {
    filterTenantUrls(ctx)
  })

  nitroApp.hooks.hook('sitemap:resolved', (ctx) => {
    filterTenantUrls(ctx)
  })
})

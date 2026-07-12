import { defineNuxtModule } from '@nuxt/kit'
import { PRIVATE_EXACT_ROUTES, PRIVATE_ROUTE_PREFIXES } from '../server/utils/seo-policy'

interface SeoModuleOptions {
  robots?: Record<string, unknown>
  sitemap?: Record<string, unknown>
}

const PRIVATE_ROUTE_PATTERNS = [
  ...PRIVATE_ROUTE_PREFIXES.map(prefix => `${prefix}/**`),
  ...Array.from(PRIVATE_EXACT_ROUTES),
]

export default defineNuxtModule({
  meta: {
    name: 'krabiclaw-seo-policy',
  },
  setup(_options, nuxt) {
    const seoOptions = nuxt.options as typeof nuxt.options & SeoModuleOptions

    seoOptions.robots = {
      groups: [
        {
          userAgent: ['*'],
          allow: ['/'],
          disallow: [
            ...PRIVATE_ROUTE_PREFIXES,
            ...Array.from(PRIVATE_EXACT_ROUTES),
          ],
        },
      ],
      sitemap: '/sitemap.xml',
    }

    seoOptions.sitemap = {
      ...(seoOptions.sitemap ?? {}),
      sources: [
        '/api/__sitemap__/docs',
        '/api/__sitemap__/blog',
        '/api/__sitemap__/pages',
        '/api/__sitemap__/locations',
        '/api/__sitemap__/menu-items',
        '/api/__sitemap__/experiences',
      ],
      excludeAppSources: ['pages', 'route-rules', 'prerender'],
      autoLastmod: true,
    }

    for (const path of PRIVATE_ROUTE_PATTERNS) {
      const existing = nuxt.options.routeRules[path] ?? {}
      nuxt.options.routeRules[path] = {
        ...existing,
        robots: false,
        headers: {
          ...(existing.headers ?? {}),
          'x-robots-tag': 'noindex, nofollow, noarchive',
          'cache-control': 'private, no-store, max-age=0',
        },
      }
    }
  },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
import { createRequire } from 'node:module'
import { getIcons } from '@iconify/utils'
import { visualizer } from 'rollup-plugin-visualizer'
import { DEFAULT_CURRENCY, isCurrencyCode } from './shared/currencies'
import { localizedPublicRouteAliases } from './build/localized-public-routes'

const configuredDefaultCurrency = process.env.DEFAULT_CURRENCY?.toUpperCase()

// nuxt/icon's serverBundle bundles a named collection in full — no usage-based
// tree-shaking. lucide is the app's sole icon pack (it's also what Nuxt UI's
// own internal defaults are hardcoded to), so only one collection ships.
// simple-icons/logos brand marks are owned locally in
// build/icon-data/custom-icons.json instead of depending on @iconify-json
// packages at build time (see that file for how to regenerate it).
const requireFromConfig = createRequire(import.meta.url)
const customIconData = requireFromConfig('./build/icon-data/custom-icons.json')
function pickIcons(collection: string, names: string[]) {
  const data = customIconData[collection]
  if (!data) throw new Error(`No local icon data for collection: ${collection}`)
  const subset = getIcons(data, names, true)
  if (!subset) throw new Error(`Missing icon(s) in local ${collection} data: ${names.join(', ')}`)

  if (subset.not_found && subset.not_found.length > 0) {
    throw new Error(`Missing icon(s) in local ${collection} data: ${subset.not_found.join(', ')}`)
  }

  return subset
}
// Optional build analysis for bundle inspection; it has no runtime effect.
const analyzeBundle = process.env.PERF_BUNDLE_ANALYZE === 'true'
const publicPerfTestPage = process.env.PERF_PUBLIC_TEST_PAGE !== 'false'
const workerWasmExternal = /(?:index_bg|yoga|webp_dec|squoosh_png_bg)\.wasm$/

const publicSurfaceCssPaths = {
  'platform-entry': 'surfaces/platform.css',
  'saya': 'surfaces/saya.css',
  'blawby': 'surfaces/blawby.css',
} as const

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function surfaceCssAssetPath(fileName: string) {
  const basename = fileName.replaceAll('\\', '/').split('/').pop()
  if (!basename) return null

  for (const [sourceName, targetPath] of Object.entries(publicSurfaceCssPaths)) {
    const sourcePattern = new RegExp(`^${escapeRegExp(sourceName)}(?:\\.[A-Za-z0-9_-]+)?\\.css$`)
    if (sourcePattern.test(basename)) {
      return targetPath
    }
  }

  return null
}

function publicSurfaceCssAssetFileName(assetInfo: { name?: string; fileName?: string }) {
  const fileName = assetInfo.name || assetInfo.fileName || ''
  return surfaceCssAssetPath(fileName)
    ? `_nuxt/${surfaceCssAssetPath(fileName)}`
    : '_nuxt/assets/[name]-[hash][extname]'
}

export default defineNuxtConfig({
  ignore: ['**/.worktrees/**', '**/.claude/**'],
  modules: [
    '@nuxt/scripts',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    '@nuxt/ui',
  ],

  ui: {
    colorMode: false,
    fonts: false,
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      bodyAttrs: {
        class: 'platform-theme',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#1F2547' }
      ],
      script: [
        {
          key: 'platform-theme-init',
          innerHTML: "try{const p=localStorage.getItem('krabiclaw-theme')||'system';const d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch{}",
        },
      ],
      link: [
        // Every Saya hero/content image is served from Cloudflare Images
        // (imagedelivery.net) — a third-party origin the browser otherwise
        // doesn't discover until it parses the <img> tag deep in <body>,
        // paying DNS+TCP+TLS setup serially after that. Preconnecting lets
        // that handshake happen in parallel with initial HTML parsing,
        // which matters most for the LCP image on image-heavy hero pages.
        // No `crossorigin` here deliberately — our <img> tags don't set it
        // either (plain no-cors requests), and Chrome only reuses a
        // preconnected connection when its CORS mode matches the real
        // request; a mismatched crossorigin attribute makes this a no-op.
        { rel: 'preconnect', href: 'https://imagedelivery.net' },
      ],
    },
  },

  compatibilityDate: '2024-11-01',

  experimental: {
    // Nuxt 5 consumes this runtime option before the current schema exposes it.
    // @ts-expect-error Nuxt 5 native Nitro mode is required for this Worker.
    nitroViteEnvironment: false,
    defaults: {
      nuxtLink: {
        prefetch: false,
      },
    },
  },
  imports: {
    transform: {
      include: [/node_modules[\\/]@nuxt[\\/]icon[\\/]/],
    },
  },
  debug: false,
  devtools: { enabled: false },
  icon: {
    provider: 'none',
    fallbackToApi: false,
    // Nuxt UI's own internal default icons (UChatPromptSubmit's arrowUp, etc.)
    // are resolved from appConfig.ui.icons dynamically, not as static name=""
    // literals, so Nuxt Icon can't inline them at build time — they're
    // resolved at request time via a self-fetch to /api/_nuxt_icon/lucide.json
    // (same internal-self-fetch category as isInternalSelfFetch() in
    // server/utils/api-response.ts). The default 1500ms fetchTimeout is too
    // tight for that round-trip in local dev; bump it so it resolves instead
    // of silently failing to render.
    fetchTimeout: 5000,
    serverBundle: false,
    clientBundle: {
      scan: true,
      icons: [
        'lucide:menu',
        'lucide:panel-left-close',
        'lucide:panel-left-open',
      ],
    },
    customCollections: [
      pickIcons('simple-icons', ['facebook', 'google', 'googlemaps', 'openai', 'whatsapp']),
      pickIcons('logos', ['google-icon', 'whatsapp-icon']),
    ],
  },
  runtimeConfig: {
    defaultCurrency: isCurrencyCode(configuredDefaultCurrency) ? configuredDefaultCurrency : DEFAULT_CURRENCY,
    public: {
      platformDomain: process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || '',
      freeSiteDomain: process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN || '',
      appName: process.env.NUXT_PUBLIC_APP_NAME || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://krabiclaw.com',
      helpUrl: process.env.NUXT_PUBLIC_HELP_URL || 'https://krabiclaw.com/help',

      whatsappNumber: process.env.NUXT_PUBLIC_WHATSAPP_NUMBER || process.env.WHATSAPP_NUMBER || '16197200000',
      perfPublicTestPage: publicPerfTestPage,
    },

  },

  vite: {
    build: {
      modulePreload: false,
      rollupOptions: {
        external: [workerWasmExternal],
        output: {
          assetFileNames: publicSurfaceCssAssetFileName,
        },
      },
    },
    server: {
      watch: {
        ignored: ['**/.worktrees/**', '**/.claude/**', '**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
      },
      allowedHosts: ['.krabiclaw.com']
    },
  },

  // Bundle analysis is opt-in and client-only; it has no runtime effect.
  hooks: {
    'pages:extend'(pages) {
      pages.push(...localizedPublicRouteAliases(pages))
    },
    'nitro:config'(nitroConfig) {
      nitroConfig.handlers = nitroConfig.handlers?.filter(
        handler => handler.route !== '/api/_nuxt_icon/:collection',
      )
    },
    'vite:extendConfig'(viteConfig, { isClient }) {
      if (analyzeBundle && isClient) {
        viteConfig.plugins?.push(visualizer({
          filename: process.env.PERF_BUNDLE_ANALYZE_OUT || 'bundle-analysis.html',
          template: 'treemap',
          gzipSize: true,
          brotliSize: true,
        }))
      }

    },
  },

  site: {
    url: 'https://krabiclaw.com',
    name: 'KrabiClaw - AI Website Builder',
    description: 'Beautiful websites powered by AI. Build your business website in minutes with our SaaS platform.',
    defaultLocale: 'en',
  },

  schemaOrg: {
    defaults: false,
  },

  // Crawler guidance. Runtime X-Robots-Tag middleware remains the authoritative
  // indexing control for private routes and non-production hosts.
  robots: {
    groups: [
      {
        userAgent: ['*'],
        allow: ['/'],
        disallow: [
          '/admin',
          '/api',
          '/auth',
          '/dashboard',
          '/dev',
          '/oauth',
          '/preview',
          '/transfer',
          '/accept-invitation',
          '/contact/confirmed',
          '/experiences/confirmed',
          '/forgot-password',
          '/login',
          '/reservations/cancel',
          '/reservations/confirmed',
          '/reset-password',
          '/signup',
          '/tenant-404',
          '/tenant-setup-incomplete',
          '/tenant-setup-pending',
          '/_next',
        ],
      },
    ],
    sitemap: '/sitemap.xml',
  },

  // The shared pages tree is not an SEO inventory. All automatic application
  // sources are disabled; server/plugins/sitemap.ts owns the complete URL set
  // on the original host-aware request event. Shared runtime caching is disabled
  // so a sitemap generated for one hostname can never be reused for another.
  sitemap: {
    excludeAppSources: true,
    cacheMaxAgeSeconds: 0,
    runtimeCacheStorage: false,
  },

  // Components configuration
  components: [
    {
      path: '~/components/tenant-pages',
      pathPrefix: false,
    },
    {
      path: '~/components/blawby',
      pathPrefix: false,
    },
    {
      path: '~/components/saya',
      prefix: 'Saya',
    },
    {
      path: '~/components/platform',
      prefix: 'Platform',
    },
    {
      path: '~/components/auth',
      prefix: 'Auth',
      pathPrefix: false,
    },
    {
      path: '~/components/ui',
      pathPrefix: false,
    },
    {
      path: '~/components/dev-perf',
      pathPrefix: false,
    },
    {
      path: '~/components/billing',
      prefix: 'Billing',
      pathPrefix: false,
    },
    {
      path: '~/components/docs',
      pathPrefix: false,
    },
    {
      path: '~/components/blog',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/dashboard',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/blog',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/content',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/editor',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/inbox',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/media',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/onboarding',
      pathPrefix: false,
    },
    {
      path: '~/lib/components/workspace/settings',
      pathPrefix: false,
    },
  ],

  // Global watcher exclusions
  watchers: {
    chokidar: {
      ignored: ['**/.worktrees/**', '**/.claude/**', '**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
    }
  },

  routeRules: {
    // Versioned static assets — immutable forever
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/surfaces/**': { headers: { 'cache-control': 'no-cache, max-age=0, must-revalidate' } },

    // OAuth consent + login pages — anti-framing required by OpenAI MCP CSP spec.
    // frame-ancestors 'none' prevents clickjacking on the consent/auth flow.
    // Keep the legacy framing header alongside the CSP for older clients.
    '/oauth/**': {
      headers: {
        'cache-control': 'no-store',
        'content-security-policy': "frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      },
    },

    // Auth/API/dashboard — never cache
    '/api/**':       { headers: { 'cache-control': 'no-store' } },
    '/dashboard/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**':     { headers: { 'cache-control': 'no-store' } },
    '/auth/**':      { headers: { 'cache-control': 'no-store' } },
    '/signup':       { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
    '/login':        { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
    '/links':        { headers: { 'cache-control': 'private, no-store' } },

  },

  // Nitro configuration for Cloudflare deployment
  nitro: {
    preset: 'cloudflare-module',
    cloudflare: {
      deployConfig: false,
    },
    devServer: {
      watch: ['server']
    },
    // Leave the resolved WASM import for Wrangler, which uploads .wasm as a precompiled
    // module. Nitro's Rollup pass cannot parse the binary, and Workers cannot compile raw
    // R2 bytes at runtime.
    rollupConfig: {
      external: [workerWasmExternal]
    },
    serverAssets: [{
      baseName: 'docs',
      dir: './docs',
      // Only .md files are ever read (server/api/docs.get.ts, server/api/docs/[slug].get.ts
      // both filter/fetch by the .md extension) - without this, every binary file anywhere
      // under docs/ (screenshots, PDFs, etc.) gets embedded into the SSR Worker bundle for
      // nothing, which is what pushed the bundle over Cloudflare's 10 MiB script size limit.
      pattern: '**/*.md'
    }, {
      baseName: 'platform',
      dir: '..',
      pattern: 'PRODUCT.md'
    }]
  }
})

// https://nuxt.com/docs/api/configuration/nuxt-config
import { createRequire } from 'node:module'
import { getIcons } from '@iconify/utils'
import { visualizer } from 'rollup-plugin-visualizer'
import { DEFAULT_CURRENCY, isCurrencyCode } from './shared/currencies'
import cloudflareDevModule from './build/cloudflare-dev-module'

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
// Opt-out only: GitHub Actions sets CI=true on every runner, including the
// preview/staging/prod deploy jobs that build the artifact actually shipped
// to Cloudflare, so gating this on ambient CI silently strips every
// scheduled task (analytics aggregation, billing reminders, sync jobs, ...)
// from production. Set NUXT_DISABLE_NITRO_TASKS=true explicitly if a local
// dev/E2E run needs to avoid task-import side effects on the D1 proxy binding.
const enableNitroTasks = process.env.NUXT_DISABLE_NITRO_TASKS !== 'true'

// Optional build analysis for bundle inspection; it has no runtime effect.
const analyzeBundle = process.env.PERF_BUNDLE_ANALYZE === 'true'
const publicPerfTestPage = process.env.PERF_PUBLIC_TEST_PAGE !== 'false'

const deploymentHost = new URL(
  process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'http://localhost',
).hostname
const productionHtmlCacheHosts = new Set(['krabiclaw.com', 'www.krabiclaw.com'])
const isNonProductionDeployment = !productionHtmlCacheHosts.has(deploymentHost)
const publicHtmlCacheHeaders = isNonProductionDeployment
  ? {
      'cache-control': 'private, no-store, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    }
  : {
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300, max-age=0',
    }

export default defineNuxtConfig({
  ignore: ['**/.worktrees/**'],
  modules: [
    cloudflareDevModule,
    '@nuxt/scripts',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    '@nuxtjs/i18n',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxt/fonts',
  ],

  ui: {
    colorMode: false,
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
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#1F2547' }
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
  debug: false,
  devtools: { enabled: false },
  css: ['~/assets/css/base.css'],
  icon: {
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
    serverBundle: {
      collections: [
        'lucide',
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
    server: {
      watch: {
        ignored: ['**/.worktrees/**', '**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
      },
      allowedHosts: ['.trycloudflare.com', 'local.krabiclaw.com', '.krabiclaw.com']
    },
  },

  // Bundle analysis is opt-in and client-only; it has no runtime effect.
  hooks: {
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

  // i18n Configuration
  i18n: {
    langDir: 'locales',  // relative to i18n/ (module default is restructureDir: 'i18n')
    // lazy: true,  // not supported in this @nuxtjs/i18n version — locale files still split by route
    locales: [
      { code: 'en',    name: 'English',    language: 'en-US', dir: 'ltr', file: 'en.json' },
      { code: 'th',    name: 'ไทย',        language: 'th-TH', dir: 'ltr', file: 'th.json' },
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    // @nuxtjs/i18n defaults runtimeOnly to false — surprising, since the
    // underlying @intlify/unplugin-vue-i18n itself defaults it to true.
    // Aliases vue-i18n to its runtime-only build in production, dropping
    // the full compiler vue-i18n itself doesn't need since messages are
    // static JSON compiled at build time.
    //
    // bundle.dropMessageCompiler was also tried (attributed as ~7.5KB gzip
    // in the entry bundle) but is NOT enabled here — verified it breaks SSR
    // for at least one real translation key (`saya.header.menu` on
    // /dev/perf-text?mode=text-with-i18n rendered an empty <div id="__nuxt">
    // with no thrown error), while simpler top-level keys elsewhere (e.g.
    // pages/about.vue) kept working. That inconsistency — some keys silently
    // failing SSR while others don't — makes it unsafe to ship without a
    // much deeper audit of every real locale key against every real page.
    bundle: {
      runtimeOnly: true,
    },
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
          '/apple-touch-icon.png',
          '/favicon.ico',
          '/site.webmanifest',
          '/tenant-icon',
          '/tenant-icon.png',
          '/tenant-icon.svg',
          '/tenant-icon-192.png',
          '/tenant-icon-512.png',
          '/tenant.webmanifest',
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
      path: '~/components/menu',
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
  ],

  // Global watcher exclusions
  watchers: {
    chokidar: {
      ignored: ['**/.worktrees/**', '**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
    }
  },

  routeRules: {
    // Versioned static assets — immutable forever
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },

    // OAuth consent + login pages — anti-framing required by OpenAI MCP CSP spec.
    // frame-ancestors 'none' prevents clickjacking on the consent/auth flow.
    // X-Frame-Options: DENY is the legacy fallback for older browsers.
    '/oauth/**': {
      headers: {
        'cache-control': 'no-store',
        'content-security-policy': "frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      },
    },

    // Content editor host routes (content/[pageId].vue, site- and
    // location-scoped) — client-only. `*` matches exactly one segment, so
    // this covers .../content/{pageId} without also matching the bare
    // .../content index route, which stays normally SSR'd like any other
    // dashboard page. definePageMeta({ ssr: false }) alone is not a reliable
    // guarantee here (page-level ssr:false depends on Nuxt's own page-render
    // path resolving before it takes effect); routeRules are read by Nitro
    // before any Vue rendering starts.
    '/dashboard/*/sites/*/content/*':                    { ssr: false },
    '/dashboard/*/sites/*/locations/*/content/*':        { ssr: false },

    // Auth/API/dashboard — never cache
    '/api/**':       { headers: { 'cache-control': 'no-store' } },
    '/dashboard/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**':     { headers: { 'cache-control': 'no-store' } },
    '/auth/**':      { headers: { 'cache-control': 'no-store' } },
    '/signup':       { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
    '/login':        { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
    '/links':        { headers: { 'cache-control': 'private, no-store' } },

    // Public pages — detectBrowserLanguage is disabled so / is safe to cache in production.
    // Explicit '/' rule overrides any cache-control the i18n module injects internally.
    '/':   { headers: publicHtmlCacheHeaders },
    '/**': { headers: publicHtmlCacheHeaders },
  },

  // Font configuration — @nuxt/fonts downloads, subsets, and self-hosts these.
  // Do NOT add @import from fonts.googleapis.com in base.css; that would double-load
  // and block rendering on a separate render-blocking external request.
  //
  // Keep only the weights used by the surfaces: Poppins for body/UI text,
  // Marcellus for Blawby display text, and Fredoka for the platform wordmark.
  // These are self-hosted by @nuxt/fonts. Do not add external font stylesheets
  // or route plugins; surface CSS selects the family it needs.
  fonts: {
    defaults: {
      subsets: ['latin'],
    },
    providers: {
      bunny: false,
      adobe: false,
      fontshare: false,
      fontsource: false,
      googleicons: false,
      npm: false,
    },
    families: [
      { name: 'Poppins', provider: 'google', weights: [400, 500, 600, 700], display: 'swap' },
      { name: 'Marcellus', provider: 'google', weights: [400], display: 'swap' },
      { name: 'Fredoka', provider: 'google', weights: [600], display: 'swap' },
    ],
  },

  // Nitro configuration for Cloudflare deployment
  nitro: {
    preset: 'cloudflare-module',
    cloudflareDev: {
      // Force deterministic binding discovery in CI/dev; avoids fallback stub env {}
      // when wrangler config auto-discovery fails from an unexpected cwd.
      configPath: './wrangler.toml',
      persistDir: '.wrangler/state/v3',
      // The MCP tunnel harness supplies one generated, untracked env file so
      // its public origin never requires mutating the developer's .dev.vars.
      envFiles: process.env.NUXT_CF_ENV_FILE ? [process.env.NUXT_CF_ENV_FILE] : undefined,
      silent: true,
    },
    experimental: {
      tasks: enableNitroTasks
    },
    // Set NUXT_DISABLE_NITRO_TASKS=true to keep task modules out of a local
    // dev/E2E boot if task imports break the nitro-cloudflare-dev D1 proxy binding.
    scheduledTasks: enableNitroTasks ? {
      '*/5 * * * *': ['translation-jobs-process', 'blog-scheduled-publish'],
      '*/10 * * * *': ['domain-reconciliation'],
      '0 3 * * *': ['domain-reconciliation-daily', 'analytics-aggregate-daily'],
      '0 4 * * *': ['site-transfer-reminders'],
      '0 1 * * *': ['cash-billing-reminders'],
      '0 0 * * 0': ['google-business-sync'],
      '0 * * * *': ['instagram-sync-process', 'review-request-automation']
    } : {},
    devServer: {
      watch: ['server']
    },
    externals: {
      inline: ['@opentelemetry/api']
    },
    // Leave the resolved WASM import for Wrangler, which uploads .wasm as a precompiled
    // module. Nitro's Rollup pass cannot parse the binary, and Workers cannot compile raw
    // R2 bytes at runtime.
    rollupConfig: {
      external: [/(?:index_bg|yoga|webp_dec|squoosh_png_bg)\.wasm$/]
    },
    serverAssets: [{
      baseName: 'docs',
      dir: './docs'
    }, {
      baseName: 'platform',
      dir: '..',
      pattern: 'PRODUCT.md'
    }]
  }
})

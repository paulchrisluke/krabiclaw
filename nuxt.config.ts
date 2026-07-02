// https://nuxt.com/docs/api/configuration/nuxt-config
import { createRequire } from 'node:module'
import { getIcons } from '@iconify/utils'
import { visualizer } from 'rollup-plugin-visualizer'
import { DEFAULT_CURRENCY, isCurrencyCode } from './shared/currencies'

const configuredDefaultCurrency = process.env.DEFAULT_CURRENCY?.toUpperCase()

// nuxt/icon's serverBundle bundles a named collection in full — no usage-based
// tree-shaking. heroicons/lucide are used broadly enough that this is fine, but
// simple-icons (~3000 icons) and logos (719 icons, multi-color art) are only
// used for a handful of brand marks, so pull just those icons out of the full
// collection JSON instead of shipping the whole package into the Worker bundle.
const requireFromConfig = createRequire(import.meta.url)
function pickIcons(collection: string, names: string[]) {
  const data = requireFromConfig(`@iconify-json/${collection}/icons.json`)
  const subset = getIcons(data, names)
  if (!subset) throw new Error(`Missing icon(s) in @iconify-json/${collection}: ${names.join(', ')}`)
  return subset
}
// Opt-out only: GitHub Actions sets CI=true on every runner, including the
// preview/staging/prod deploy jobs that build the artifact actually shipped
// to Cloudflare, so gating this on ambient CI silently strips every
// scheduled task (analytics aggregation, billing reminders, sync jobs, ...)
// from production. Set NUXT_DISABLE_NITRO_TASKS=true explicitly if a local
// dev/E2E run needs to avoid task-import side effects on the D1 proxy binding.
const enableNitroTasks = process.env.NUXT_DISABLE_NITRO_TASKS !== 'true'

// PERF DEBUG PATCH (temporary — remove once the entry.css floor is attributed):
// build-time-only flag, not a runtime one, since global css: [...] is compiled
// into a single stylesheet at build time and can't be conditionally skipped
// per-request. Set PERF_NO_GLOBAL_CSS=true and rebuild to measure
// /dev/perf-text?mode=text-no-icons with no global CSS at all.
const skipGlobalCss = process.env.PERF_NO_GLOBAL_CSS === 'true'

// PERF DEBUG PATCH (temporary — remove once the entry.js floor is attributed):
// generates a client-bundle treemap at PERF_BUNDLE_ANALYZE_OUT (or
// bundle-analysis.html in the repo root) to identify what's actually inside
// the ~511KB entry chunk. Set PERF_BUNDLE_ANALYZE=true and rebuild.
const analyzeBundle = process.env.PERF_BUNDLE_ANALYZE === 'true'

export default defineNuxtConfig({
  modules: [
    'nitro-cloudflare-dev',
    '@nuxt/scripts',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    '@nuxtjs/i18n',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxt/fonts',
  ],

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
  // PERF DEBUG PATCH: see skipGlobalCss above.
  css: skipGlobalCss ? [] : ['~/assets/css/main.css'],
  icon: {
    fallbackToApi: false,
    serverBundle: {
      collections: [
        'heroicons',
        'lucide',
        // Brand icons: only the exact marks referenced in the app (see
        // pickIcons above) — not the full simple-icons/logos collections.
        pickIcons('simple-icons', ['facebook', 'instagram', 'tiktok', 'google', 'googlemaps', 'openai', 'whatsapp']),
        pickIcons('logos', ['google-icon', 'whatsapp-icon']),
      ],
    },
  },
  runtimeConfig: {
    defaultCurrency: isCurrencyCode(configuredDefaultCurrency) ? configuredDefaultCurrency : DEFAULT_CURRENCY,
    public: {
      platformDomain: process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || '',
      freeSiteDomain: process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN || '',
      appName: process.env.NUXT_PUBLIC_APP_NAME || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://krabiclaw.com',
      turnstileEnabled: process.env.NUXT_PUBLIC_TURNSTILE_ENABLED === 'true',
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || '',
      whatsappNumber: process.env.NUXT_PUBLIC_WHATSAPP_NUMBER || process.env.WHATSAPP_NUMBER || '16197200000'
    },
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || ''
  },

  vite: {
    server: {
      watch: {
        ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
      },
      allowedHosts: ['.trycloudflare.com', 'local.krabiclaw.com']
    },
  },

  // PERF DEBUG PATCH (temporary — remove once the entry.js floor is attributed):
  // vite.plugins is shared between the client and server Vite builds, so the
  // visualizer is attached via this hook instead, gated to isClient only —
  // otherwise the server (Nitro/SSR) build would overwrite the client's
  // treemap output on whichever build ran second.
  hooks: {
    'vite:extendConfig'(viteConfig, { isClient }) {
      if (!analyzeBundle || !isClient) return
      viteConfig.plugins?.push(visualizer({
        filename: process.env.PERF_BUNDLE_ANALYZE_OUT || 'bundle-analysis.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }))
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
  },

  // Robots.txt configuration
  robots: {
    allow: ['/'],
    disallow: ['/dashboard', '/api/**'],
    sitemap: '/sitemap.xml',
  },

  // Sitemap configuration
  sitemap: {
    sources: ['/api/__sitemap__/docs', '/api/__sitemap__/blog'],
  },

  
  // Components configuration
  components: [
    {
      path: '~/components/saya',
      prefix: 'Saya',
    },
    {
      path: '~/components/platform',
      prefix: 'Platform',
    },
    {
      path: '~/components/ui',
      pathPrefix: false,
    },
    {
      path: '~/components/menu',
      pathPrefix: false,
    },
    {
      path: '~/components/editor',
      pathPrefix: false,
    },
    {
      path: '~/components/dashboard',
      pathPrefix: false,
    },
    {
      path: '~/components/media',
      pathPrefix: false,
    },
    {
      path: '~/components/billing',
      prefix: 'Billing',
      pathPrefix: false,
    },
    {
      path: '~/components/onboarding',
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
  ],

  // Global watcher exclusions
  watchers: {
    chokidar: {
      ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
    }
  },

  routeRules: {
    // Versioned static assets — immutable forever
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },

    // MCP widget assets — must be loadable from ChatGPT sandbox iframes on any origin.
    // The sandbox iframe origin is <slug>.web-sandbox.oaiusercontent.com, which changes
    // per environment (staging-krabiclaw-com.web-sandbox.oaiusercontent.com on staging).
    // Wildcard ACAO is safe here: these are public, unauthenticated static JS/CSS files.
    '/mcp-assets/**': {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': '*',
        'cache-control': 'public, max-age=3600, stale-while-revalidate=60',
      },
    },

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

    // Auth/API/dashboard — never cache
    '/api/**':       { headers: { 'cache-control': 'no-store' } },
    '/dashboard/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**':     { headers: { 'cache-control': 'no-store' } },
    '/auth/**':      { headers: { 'cache-control': 'no-store' } },
    '/signup':       { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
    '/login':        { headers: { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },

    // Public pages — detectBrowserLanguage is disabled so / is safe to cache.
    // Explicit '/' rule overrides any cache-control the i18n module injects internally.
    '/':   { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300, max-age=0' } },
    '/**': { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300, max-age=0' } },
  },

  // Font configuration — @nuxt/fonts downloads, subsets, and self-hosts these.
  // Do NOT add @import from fonts.googleapis.com in main.css; that would double-load
  // and block rendering on a separate render-blocking external request.
  //
  // Poppins: only the weights actually used in CSS (NOT all 18 variants).
  // Instrument Serif: italic is the LCP font on tenant hero pages — kept minimal.
  // Fredoka: platform wordmark / display, all 4 weights used.
  //
  // All three families are Google Fonts — pin `provider: 'google'` per family and
  // disable the other providers so unifont never registers/queries them (e.g. the
  // bunny provider fetches https://fonts.bunny.net/list on every boot otherwise,
  // adding retry delay for a provider this project doesn't use).
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
      { name: 'Instrument Serif', provider: 'google', weights: [400], styles: ['normal', 'italic'], display: 'swap' },
      { name: 'Poppins', provider: 'google', weights: [400, 500, 600, 700], display: 'swap' },
      { name: 'Fredoka', provider: 'google', weights: [400, 500, 600, 700], display: 'swap' },
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
      silent: true,
    },
    experimental: {
      tasks: enableNitroTasks
    },
    // Set NUXT_DISABLE_NITRO_TASKS=true to keep task modules out of a local
    // dev/E2E boot if task imports break the nitro-cloudflare-dev D1 proxy binding.
    scheduledTasks: enableNitroTasks ? {
      '*/5 * * * *': ['translation-jobs-process'],
      '*/10 * * * *': ['domain-reconciliation'],
      '0 3 * * *': ['domain-reconciliation-daily', 'analytics-aggregate-daily'],
      '0 4 * * *': ['site-transfer-reminders'],
      '0 1 * * *': ['cash-billing-reminders'],
      '0 * * * *': ['instagram-sync-process', 'google-business-sync']
    } : {},
    devServer: {
      watch: ['server']
    },
    externals: {
      inline: ['@opentelemetry/api']
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

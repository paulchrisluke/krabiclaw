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

// PERF DEBUG PATCH (temporary — remove once the entry.css contributor matrix
// is done): main.css's individual @import/@plugin lines can't be toggled via
// css: [...] (that only swaps whole files), so this strips one line at a
// time from the source before Tailwind's own Vite plugin consumes it. Only
// one flag is meant to be set per build.
const cssStrips: [envVar: string, line: string][] = [
  ['PERF_NO_SAYA_CSS', '@import "./saya.css";'],
  ['PERF_NO_TYPOGRAPHY_CSS', '@plugin "@tailwindcss/typography";'],
  ['PERF_NO_NUXT_UI_CSS', '@import "@nuxt/ui";'],
  ['PERF_NO_TAILWIND_CSS', '@import "tailwindcss";'],
]

// PERF DEBUG PATCH (temporary — remove once the client JS/hydration floor is
// attributed): Nuxt's built-in features.noScripts strips every script chunk
// from the production build entirely (no entry.js, no modulepreload, no
// hydration at all) — it only takes effect outside dev mode, so it fits the
// same build-once-and-measure pattern as the CSS flags above. Set
// PERF_NO_SCRIPTS=true and rebuild to compare pure static-HTML SSR timing
// against the normal hydrated build on /dev/perf-text.
const skipClientScripts = process.env.PERF_NO_SCRIPTS === 'true'

// PERF DEBUG PATCH (temporary): build/runtime flags for isolating global
// client-floor items that affect every /dev/perf-text mode before the page
// branch can opt in/out. Set one flag at a time and rebuild.
const skipDompurifyHooks = process.env.PERF_NO_DOMPURIFY_HOOKS === 'true'
const publicPerfTestPage = process.env.PERF_PUBLIC_TEST_PAGE !== 'false'

// Tried (2026-07-02): a `PERF_CSS_EXCLUDE_DASHBOARD` flag appending
// `@source not "<glob>";` to main.css for dashboard/admin/editor/billing/
// onboarding/media paths, to measure how much of entry.css a public/tenant
// visitor pays for but never renders. Removed — `@source not` had no
// measurable effect in this stack: a class unique to a single dashboard-only
// component (`[320px]` in components/dashboard/McpQuickActions.vue) still
// appeared in the compiled entry.css after excluding its exact path, tested
// with both relative and absolute glob paths, and even edited directly into
// assets/css/main.css (not just via the build-flag injection). Most likely
// cause: @nuxt/ui's own Tailwind integration performs its own unconditional
// project-wide content scan that a `@source not` in the app's own main.css
// can't override. Don't re-attempt this exact approach without first
// confirming (e.g. via @nuxt/ui's own docs/issues) whether their Tailwind
// integration exposes a way to scope its content scan at all.

export default defineNuxtConfig({
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
  // PERF DEBUG PATCH: see skipClientScripts above.
  features: {
    noScripts: skipClientScripts,
  },
  // PERF DEBUG PATCH: see skipGlobalCss above.
  css: skipGlobalCss ? [] : ['~/assets/css/main.css'],
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
      perfNoDompurifyHooks: skipDompurifyHooks,
      perfPublicTestPage: publicPerfTestPage,
    },

  },

  vite: {
    server: {
      watch: {
        ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
      },
      allowedHosts: ['.trycloudflare.com', 'local.krabiclaw.com', '.krabiclaw.com']
    },
  },

  // PERF DEBUG PATCH (temporary — remove once the entry.js floor is attributed):
  // vite.plugins is shared between the client and server Vite builds, so the
  // visualizer is attached via this hook instead, gated to isClient only —
  // otherwise the server (Nitro/SSR) build would overwrite the client's
  // treemap output on whichever build ran second.
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

      // PERF DEBUG PATCH: see cssStrips above. enforce: 'pre' so this runs
      // before Tailwind's own Vite plugin consumes the @import/@plugin
      // at-rules in main.css.
      const activeStrips = cssStrips.filter(([envVar]) => process.env[envVar] === 'true')
      if (activeStrips.length > 1) {
        throw new Error(`Multiple PERF_NO_* CSS strip flags enabled: ${activeStrips.map(s => s[0]).join(', ')}. Only one is allowed.`)
      }
      if (activeStrips.length === 1) {
        const activeStrip = activeStrips[0]
        if (activeStrip) {
          const [, line] = activeStrip
          // unshift, not push: Tailwind's own Vite plugin is also enforce:'pre'
          // and already registered by the time this hook runs, so a same-
          // priority plugin appended via push still runs after it (same-enforce
          // plugins execute in array order). Putting this one first in the
          // array is what actually lets it see the raw source before Tailwind
          // resolves/inlines the @import chain.
          viteConfig.plugins?.unshift({
            name: 'perf-debug-strip-css',
            enforce: 'pre',
            transform(code: string, id: string) {
              if (!id.endsWith('assets/css/main.css')) return
              if (!code.includes(line)) throw new Error(`Target CSS line not found for stripping: ${line}`)
              return code.replace(line, `/* PERF DEBUG PATCH: stripped "${line}" */`)
            },
          })
        }
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
      path: '~/components/workspace/editor',
      pathPrefix: false,
    },
    {
      path: '~/components/workspace/dashboard',
      pathPrefix: false,
    },
    {
      path: '~/components/workspace/media',
      pathPrefix: false,
    },
    {
      path: '~/components/billing',
      prefix: 'Billing',
      pathPrefix: false,
    },
    {
      path: '~/components/workspace/onboarding',
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
  // Fredoka: platform wordmark only, weight 600 only (not all 4 weights).
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
      // Instrument Serif removed from global load — loaded conditionally on tenant routes via plugin
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
      external: [/(?:index_bg|yoga)\.wasm$/]
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

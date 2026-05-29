// https://nuxt.com/docs/api/configuration/nuxt-config
import { DEFAULT_CURRENCY, isCurrencyCode } from './shared/currencies'

const configuredDefaultCurrency = process.env.DEFAULT_CURRENCY?.toUpperCase()

export default defineNuxtConfig({
  modules: ['nitro-cloudflare-dev', '@nuxt/scripts', '@nuxtjs/robots', '@nuxtjs/sitemap', 'nuxt-schema-org', '@nuxtjs/i18n', '@nuxt/ui', '@nuxt/eslint', '@nuxt/image', '@nuxt/fonts'],

  scripts: {
    registry: {
      googleAnalytics: {
        id: 'G-Z18L1Y4G7K'
      }
    }
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
        { rel: 'preconnect', href: 'https://media.krabiclaw.com' },
        { rel: 'dns-prefetch', href: 'https://media.krabiclaw.com' },
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ]
    },
  },

  compatibilityDate: '2024-11-01',
  debug: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
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
      }
    },
    build: {
      // CSS code splitting was disabled due to FOUC/hydration races in the
      // Cloudflare Workers SSR environment. Re-enable via env flag when you're
      // confident the runtime supports async CSS chunk loading. Default remains
      // false to avoid accidental FOUC in production.
      cssCodeSplit: process.env.NUXT_CSS_CODE_SPLIT === 'true',
    },
  },

  // SEO Configuration
  site: {
    url: 'https://krabiclaw.com',
    name: 'KrabiClaw - Restaurant Website Builder',
    description: 'Beautiful restaurant websites powered by AI. Build your restaurant website in minutes with our SaaS platform.',
    defaultLocale: 'en',
  },

  // i18n Configuration
  i18n: {
    locales: [
      {
        code: 'en',
        name: 'English',
        language: 'en-US',
        dir: 'ltr'
      },
      {
        code: 'th',
        name: 'ไทย',
        language: 'th-TH',
        dir: 'ltr'
      },
      {
        code: 'fr',
        name: 'Français',
        language: 'fr-FR',
        dir: 'ltr'
      },
      {
        code: 'ja',
        name: '日本語',
        language: 'ja-JP',
        dir: 'ltr'
      },
      {
        code: 'zh-CN',
        name: '简体中文',
        language: 'zh-CN',
        dir: 'ltr'
      },
      {
        code: 'ko',
        name: '한국어',
        language: 'ko-KR',
        dir: 'ltr'
      },
      {
        code: 'es',
        name: 'Español',
        language: 'es-ES',
        dir: 'ltr'
      },
      {
        code: 'de',
        name: 'Deutsch',
        language: 'de-DE',
        dir: 'ltr'
      },
      {
        code: 'it',
        name: 'Italiano',
        language: 'it-IT',
        dir: 'ltr'
      },
      {
        code: 'ar',
        name: 'العربية',
        language: 'ar-SA',
        dir: 'rtl'
      }
    ],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: {
      useCookie: false,
      fallbackLocale: 'en',
      redirectOn: 'root'
    }
  },

  // Robots.txt configuration
  robots: {
    allow: ['/'],
    disallow: ['/dashboard', '/api/**'],
    sitemap: '/sitemap.xml',
  },

  // Sitemap configuration
  sitemap: {},

  
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
  ],

  // Global watcher exclusions
  watchers: {
    chokidar: {
      ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
    }
  },

  // Caching Rules
  // NOTE: swr is NOT safe for multi-tenant — Nitro keys the cache by path only,
  // not by full URL+hostname. All page routes serve different content per subdomain
  // so swr would cross-contaminate tenants. Static assets are safe (same file for all hosts).
  routeRules: {
    // Immutable versioned static assets
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/videos/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/images/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },

    // Never cache authenticated or API routes
    '/api/**':       { headers: { 'cache-control': 'no-store' } },
    '/dashboard/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**':     { headers: { 'cache-control': 'no-store' } },
    '/auth/**':      { headers: { 'cache-control': 'no-store' } },
    '/signup':       { headers: { 'cache-control': 'no-store' } },
    '/login':        { headers: { 'cache-control': 'no-store' } },

    // Root path: no edge caching to avoid browser-language redirect conflicts
    // detectBrowserLanguage redirects based on Accept-Language without a cookie,
    // so CDN caching would serve the wrong locale redirect. Disable edge cache here.
    '/': { headers: { 'cache-control': 'public, max-age=0, s-maxage=0' } },

    // Public marketing pages — cache at Cloudflare edge for 5 minutes
    // Requires a Cloudflare Cache Rule set to "Cache Everything" for *.krabiclaw.com/*
    // to override the default Set-Cookie bypass behavior.
    // IMPORTANT (multi-tenant): The Cloudflare Cache Rule MUST include a custom cache key
    // that incorporates the Host header (subdomain) so responses for demo.krabiclaw.com
    // and pottery-house.krabiclaw.com are cached separately. Without this, Cloudflare keys
    // by path alone and tenants will receive each other's cached pages.
    // Automation: there's a lightweight e2e that asserts cache isolation between hostnames
    // at tests/e2e/cache-key.spec.ts — run `yarn test:e2e` after deployment to validate.
    '/**': { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600, max-age=0' } },
  },


  // Nitro configuration for Cloudflare deployment
  nitro: {
    preset: 'cloudflare-module',
    experimental: {
      tasks: true
    },
    scheduledTasks: {
      '*/5 * * * *': ['translation-jobs-process'],
      '*/10 * * * *': ['domain-reconciliation'],
      '0 3 * * *': ['domain-reconciliation-daily']
    },
    devServer: {
      watch: ['server']
    },
    externals: {
      inline: ['@opentelemetry/api']
    },
    serverAssets: [{
      baseName: 'docs',
      dir: './docs'
    }]
  }
})

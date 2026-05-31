// https://nuxt.com/docs/api/configuration/nuxt-config
import { DEFAULT_CURRENCY, isCurrencyCode } from './shared/currencies'

const configuredDefaultCurrency = process.env.DEFAULT_CURRENCY?.toUpperCase()
const useCloudflareDevBindings = process.env.NUXT_DISABLE_CF_DEV_BINDINGS !== '1'

export default defineNuxtConfig({
  modules: [
    ...(useCloudflareDevBindings ? ['nitro-cloudflare-dev'] : []),
    '@nuxt/scripts',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    '@nuxtjs/i18n',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/fonts',
  ],

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
  },

  site: {
    url: 'https://krabiclaw.com',
    name: 'KrabiClaw - AI Website Builder',
    description: 'Beautiful websites powered by AI. Build your business website in minutes with our SaaS platform.',
    defaultLocale: 'en',
  },

  // i18n Configuration
  i18n: {
    langDir: 'locales',  // relative to i18n/ (module default is restructureDir: 'i18n')
    // lazy: true,  // not supported in this @nuxtjs/i18n version — locale files still split by route
    locales: [
      { code: 'en',    name: 'English',    language: 'en-US', dir: 'ltr', file: 'en.json' },
      { code: 'th',    name: 'ไทย',        language: 'th-TH', dir: 'ltr', file: 'th.json' },
      { code: 'fr',    name: 'Français',   language: 'fr-FR', dir: 'ltr', file: 'fr.json' },
      { code: 'ja',    name: '日本語',      language: 'ja-JP', dir: 'ltr', file: 'ja.json' },
      { code: 'zh-CN', name: '简体中文',    language: 'zh-CN', dir: 'ltr', file: 'zh-CN.json' },
      { code: 'ko',    name: '한국어',      language: 'ko-KR', dir: 'ltr', file: 'ko.json' },
      { code: 'es',    name: 'Español',    language: 'es-ES', dir: 'ltr', file: 'es.json' },
      { code: 'de',    name: 'Deutsch',    language: 'de-DE', dir: 'ltr', file: 'de.json' },
      { code: 'it',    name: 'Italiano',   language: 'it-IT', dir: 'ltr', file: 'it.json' },
      { code: 'ar',    name: 'العربية',    language: 'ar-SA', dir: 'rtl', file: 'ar.json' },
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

  routeRules: {
    // Versioned static assets — immutable forever
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },

    // Auth/API/dashboard — never cache
    '/api/**':       { headers: { 'cache-control': 'no-store' } },
    '/dashboard/**': { headers: { 'cache-control': 'no-store' } },
    '/admin/**':     { headers: { 'cache-control': 'no-store' } },
    '/auth/**':      { headers: { 'cache-control': 'no-store' } },
    '/signup':       { headers: { 'cache-control': 'no-store' } },
    '/login':        { headers: { 'cache-control': 'no-store' } },

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
  fonts: {
    defaults: {
      subsets: ['latin'],
    },
    families: [
      { name: 'Instrument Serif', weights: [400], styles: ['normal', 'italic'], display: 'swap' },
      { name: 'Poppins', weights: [400, 500, 600, 700], display: 'swap' },
      { name: 'Fredoka', weights: [400, 500, 600, 700], display: 'swap' },
    ],
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
      '0 3 * * *': ['domain-reconciliation-daily'],
      '0 * * * *': ['instagram-sync-process', 'google-business-sync']
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

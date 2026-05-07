// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['nitro-cloudflare-dev', 'nuxt-gtag', '@nuxtjs/robots', '@nuxtjs/sitemap', 'nuxt-schema-org', '@nuxtjs/i18n', '@nuxt/ui'],
  
  // Nuxt UI configuration
  '@nuxt/ui': {
    components: true,
    theme: {
      colors: ['primary', 'secondary', 'accent', 'neutral', 'success', 'warning', 'error', 'info'],
    }
  },
  ui: {
    colors: {
      primary: 'neutral',
      neutral: 'zinc'
    }
  },
  gtag: {
    id: 'G-Z18L1Y4G7K'
  },
  
  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#000000' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'shortcut icon', href: '/favicon.ico', type: 'image/x-icon' }
      ]
    },
  },

  compatibilityDate: '2024-11-01',
  debug: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      platformDomain: process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || '',
      freeSiteDomain: process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN || '',
      appName: process.env.NUXT_PUBLIC_APP_NAME || '',
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || ''
    },
    // Server-only
    platformDomain: process.env.NUXT_PLATFORM_DOMAIN || ''
  },

  vite: {
    server: {
      watch: {
        ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
      }
    }
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
        code: 'ja',
        name: '日本語',
        language: 'ja-JP',
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
      useCookie: true,
      fallbackLocale: 'en',
      redirectOn: 'root'
    }
  },

  // Robots.txt configuration
  robots: {
    allow: ['/'],
    disallow: ['/dashboard', '/api'],
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
    }
  ],

  // Global watcher exclusions
  watchers: {
    chokidar: {
      ignored: ['**/.wrangler/**', '**/.data/**', '**/node_modules/**', '**/.git/**', '**/.nuxt/**', '**/.output/**', '**/dist/**']
    }
  },

  // Nitro configuration for Cloudflare deployment
  nitro: {
    preset: 'cloudflare-pages',
    cloudflare: {
      deployConfig: true
    },
    devServer: {
      watch: ['server']
    },
    externals: {
      inline: ['@opentelemetry/api']
    }
  }
})

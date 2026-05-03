// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['nuxt-gtag', '@nuxtjs/robots', '@nuxtjs/sitemap', 'nuxt-schema-org', '@nuxtjs/i18n'],
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
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || ''
    }
  },

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  // SEO Configuration
  site: {
    url: 'https://www.kikuzuki-thailand.com',
    name: 'Take Me Away by KIKUZUKI | Japanese Robatayaki Izakaya',
    description: 'Experience authentic Japanese robatayaki at Take Me Away by KIKUZUKI in Krabi, Thailand. Fresh ingredients, traditional flavors, and unforgettable dining experience in southern Thailand.',
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
      fallbackLocale: 'en'
    }
  },

  // Robots.txt configuration
  robots: {
    allow: ['/'],
    disallow: ['/admin', '/api'],
  },

  // Sitemap configuration
  sitemap: {},

  
  // Nitro configuration for Cloudflare deployment
  nitro: {
    preset: 'cloudflare-module',
    cloudflare: {
      deployConfig: true,
      wrangler: {
        name: 'kikuzuki-thailand-marketing',
        d1_databases: [
          {
            binding: 'REVIEWS_DB',
            database_name: 'kikuzuki-reviews',
            database_id: '57cc9c44-1a23-41c3-8ec9-6b404c12ca2c'
          }
        ]
      }
    }
  }
})

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

  // Schema.org configuration for local business
  schemaOrg: {
    identity: {
      type: 'Restaurant',
      name: 'Take Me Away by KIKUZUKI',
      description: 'Modern izakaya restaurant in Krabi, Thailand. Experience authentic Japanese robatayaki with fresh ingredients and traditional flavors.',
      url: 'https://www.kikuzuki-thailand.com',
      logo: '/og-image.jpg',
      image: '/og-image.jpg',
      address: {
        streetAddress: '117, Nong Thale',
        addressLocality: 'Krabi',
        addressRegion: 'Krabi Province',
        postalCode: '81000',
        addressCountry: 'TH'
      },
      geo: {
        latitude: 8.0572977,
        longitude: 98.7493211
      },
      telephone: '+66-81-154-3606',
      email: 'info@kikuzuki-thailand.com',
      openingHoursSpecification: [
        {
          dayOfWeek: ['Sunday'],
          opens: '12:00',
          closes: '22:30'
        },
        {
          dayOfWeek: ['Monday'],
          opens: 'Closed',
          closes: 'Closed'
        },
        {
          dayOfWeek: ['Tuesday','Wednesday','Thursday','Friday','Saturday'],
          opens: '12:00',
          closes: '22:30'
        }
      ],
      priceRange: '$$',
      servesCuisine: ['Japanese', 'Robatayaki', 'Izakaya'],
      hasMap: 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
      sameAs: [
        'https://www.facebook.com/kikuzuki-thailand',
        'https://www.instagram.com/kikuzuki-thailand'
      ]
    }
  }
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['nuxt-gtag', '@nuxtjs/robots', '@nuxtjs/sitemap', 'nuxt-schema-org', '@nuxtjs/i18n'],
  gtag: {
    id: 'G-Z18L1Y4G7K'
  },
  
  app: {
    head: {
      title: 'Take Me Away by KIKUZUKI | Authentic Thai Cuisine',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { property: 'og:title', content: 'Take Me Away by KIKUZUKI | Authentic Thai Cuisine' },
        { property: 'og:description', content: 'Experience authentic Thai cuisine at Take Me Away by KIKUZUKI. Fresh ingredients, traditional flavors, and unforgettable dining experience in southern Thailand.' },
        { property: 'og:image', content: '/og-image.jpg' },
        { property: 'og:video', content: '/og-video.mp4' },
        { property: 'og:url', content: 'https://www.kikuzuki-thailand.com' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Take Me Away by KIKUZUKI' },
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

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  // SEO Configuration
  site: {
    url: 'https://www.kikuzuki-thailand.com',
    name: 'Take Me Away by KIKUZUKI | Authentic Thai Cuisine',
    description: 'Experience authentic Thai cuisine at Take Me Away by KIKUZUKI. Fresh ingredients, traditional flavors, and unforgettable dining experience in southern Thailand.',
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
      description: 'Authentic Thai cuisine restaurant in southern Thailand offering fresh ingredients and traditional flavors',
      url: 'https://www.kikuzuki-thailand.com',
      logo: '/og-image.jpg',
      image: '/og-image.jpg',
      address: {
        streetAddress: 'Southern Thailand',
        addressLocality: 'Krabi',
        addressRegion: 'Krabi Province',
        postalCode: '81000',
        addressCountry: 'TH'
      },
      geo: {
        latitude: 8.0573,
        longitude: 98.7445
      },
      telephone: '+66-76-XXX-XXXX',
      email: 'info@kikuzuki-thailand.com',
      openingHours: 'Mo-Su 10:00-22:00',
      priceRange: '$$',
      servesCuisine: 'Thai',
      sameAs: [
        'https://www.facebook.com/kikuzuki-thailand',
        'https://www.instagram.com/kikuzuki-thailand'
      ]
    }
  }
})
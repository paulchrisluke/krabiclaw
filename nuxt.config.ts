// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['nuxt-gtag'],
  gtag: {
    id: 'G-Z18L1Y4G7K'
  },
  app: {
    head: {
      title: 'Sand-O | Authentic Shokupan Bread',
      htmlAttrs: {
        lang: 'en',
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { property: 'og:title', content: 'Sand-O | Authentic Shokupan Bread' },
        { property: 'og:description', content: 'Come taste the 8th wonder of the world. Authentic Shokupan Bread, where dreams come true.' },
        { property: 'og:image', content: '/og-image.jpg' },
        { property: 'og:video', content: '/og-video.mp4' },
        { property: 'og:url', content: 'https://sand-o.com' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Sand-O' },
        { name: 'theme-color', content: '#000000' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'shortcut icon', href: '/favicon.ico', type: 'image/x-icon' }
      ]
    },
  },

  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  modules: ['nuxt-gtag']
})
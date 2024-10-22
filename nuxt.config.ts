// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      meta: [
        { property: 'og:title', content: 'Sand-O | Authentic Shokupan Bread' },
        { property: 'og:description', content: 'Come taste the 8th wonder of the world. Authentic Shokupan Bread, where dreams come true.' },
        { property: 'og:image', content: 'https://sand-o.com//og-image.jpg' },
        { property: 'og:video', content: 'https://sand-o.com/og-video.mp4' },
        { property: 'og:url', content: 'https://sand-o.com' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Sand-O' },
        { name: 'theme-color', content: '#000000' }
      ],
      link: [
        { rel: 'icon', href: 'https://sand-o.com/favicon.ico', type: 'image/x-icon' },
        { rel: 'shortcut icon', href: 'https://sand-o.com/favicon.ico', type: 'image/x-icon' }
      ]
    }
  },
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  hooks: {
    'prerender:routes' ({ routes }) {
      routes.clear() // Do not generate any routes (except the defaults)
    }
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  }
})

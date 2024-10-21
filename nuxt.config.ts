// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  nitro: {
    prerender: {
      routes: ['/404'],  // Add this line to ensure the 404 page is prerendered
    },
    hooks: {
      "prerender:generate"(route) {
        if (route.route?.includes("private")) {
          route.skip = true;
        }
      },
    },
  },
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  }
})

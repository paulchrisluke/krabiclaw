export default defineNuxtPlugin(() => {
  const route = useRoute()

  useHead(() => {
    if (!route.path.startsWith('/dashboard')) return {}

    return {
      meta: [
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'KrabiClaw' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/krabi-claw-logo.png' },
      ],
    }
  })
})

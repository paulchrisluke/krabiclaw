export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', async () => {
    const { registerPageviewTracking } = await import('~/utils/pageview-tracking-runtime.client')
    await nuxtApp.runWithContext(registerPageviewTracking)
  })
})

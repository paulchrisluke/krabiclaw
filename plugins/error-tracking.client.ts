export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', async () => {
    const { registerErrorTracking } = await import('~/utils/error-tracking-runtime.client')
    await nuxtApp.runWithContext(() => registerErrorTracking(nuxtApp))
  })
})

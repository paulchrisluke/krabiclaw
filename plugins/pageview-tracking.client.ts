import { collectorRegistered } from '~/utils/pageview-tracking-runtime.client'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', async () => {
    try {
      const { registerPageviewTracking } = await import('~/utils/pageview-tracking-runtime.client')
      await nuxtApp.runWithContext(registerPageviewTracking)
    } catch (error) {
      await nuxtApp.callHook('vue:error', error, null, 'analytics-collector-registration')
    } finally {
      // Emitters waiting for the collector's page identity are released either way.
      collectorRegistered()
    }
  })
})

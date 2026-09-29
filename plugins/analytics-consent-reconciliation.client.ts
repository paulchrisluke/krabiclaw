import { reconcileAnalyticsConsent } from '~/composables/useAnalyticsConsentReconciliation'

export default defineNuxtPlugin((nuxtApp) => {
  document.addEventListener('zarazConsentChoicesUpdated', () => {
    void reconcileAnalyticsConsent().catch(error => nuxtApp.callHook('vue:error', error, null, 'analytics-consent-reconciliation'))
  })
})

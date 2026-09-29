import { reconcileAnalyticsConsent } from '~/composables/useAnalyticsConsentReconciliation'

export default defineNuxtPlugin(() => {
  document.addEventListener('zarazConsentChoicesUpdated', reconcileAnalyticsConsent)
})

export const ZARAZ_ANALYTICS_PURPOSE_ID = 'kc_analytics'

export const ZARAZ_ANALYTICS_PURPOSE = {
  name: 'Analytics',
  description: 'Measure site usage and advertising effectiveness so we can improve our services.',
}

export function showZarazConsentModal() {
  if (!import.meta.client) return
  const zaraz = (window as Window & { zaraz?: { showConsentModal?: () => void } }).zaraz
  zaraz?.showConsentModal?.()
}

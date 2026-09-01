export const ZARAZ_ANALYTICS_PURPOSE_ID = 'kc_analytics'

export const ZARAZ_ANALYTICS_PURPOSE = {
  name: 'Analytics',
  description: 'Measure site usage and advertising effectiveness so we can improve our services.',
}

function openConsentModal() {
  const zaraz = (window as Window & { zaraz?: { showConsentModal?: () => void } }).zaraz
  if (!zaraz?.showConsentModal) return false
  zaraz.showConsentModal()
  return true
}

export function showZarazConsentModal() {
  if (!import.meta.client) return
  if (openConsentModal()) return
  document.addEventListener('zarazConsentAPIReady', openConsentModal, { once: true })
}

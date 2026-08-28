export const ZARAZ_ANALYTICS_PURPOSE_ID = 'kc_analytics'

export const ZARAZ_ANALYTICS_PURPOSE = {
  name: 'Analytics',
  description: 'Measure site usage and advertising effectiveness so we can improve our services.',
}

type ZarazConsent = {
  modal: boolean
}

function openConsentModal() {
  const consent = (window as Window & { zaraz?: { consent?: ZarazConsent } }).zaraz?.consent
  if (!consent) return false
  consent.modal = true
  return true
}

export function showZarazConsentModal() {
  if (!import.meta.client) return
  if (openConsentModal()) return
  document.addEventListener('zarazConsentAPIReady', openConsentModal, { once: true })
}

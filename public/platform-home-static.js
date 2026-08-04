(() => {
  const consentCategories = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']
  const consentValue = document.cookie
    .split('; ')
    .find((value) => value.startsWith('kc_consent='))
    ?.split('=')[1]
  const consentState = consentValue === 'accepted' ? 'granted' : 'denied'
  const consentPayload = Object.fromEntries(consentCategories.map((key) => [key, consentState]))

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(['consent', 'default', consentPayload])
  window.zaraz?.set?.('google_consent_default', consentPayload)

  const banner = document.querySelector('[data-consent-banner]')
  if (!banner) return

  for (const button of banner.querySelectorAll('[data-consent-action]')) {
    button.addEventListener('click', () => {
      const value = button.getAttribute('data-consent-action')
      if (value !== 'accepted' && value !== 'rejected') {
        console.error('Invalid cookie consent action')
        return
      }

      document.cookie = `kc_consent=${value}; Max-Age=31536000; Path=/; SameSite=Lax`
      const nextState = value === 'accepted' ? 'granted' : 'denied'
      const nextPayload = Object.fromEntries(consentCategories.map((key) => [key, nextState]))
      window.dataLayer.push(['consent', 'update', nextPayload])
      window.zaraz?.set?.('google_consent_update', nextPayload)
      banner.remove()
    })
  }
})()

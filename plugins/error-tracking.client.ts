// Reports uncaught Vue component errors and unhandled promise rejections to
// GA4 (krabiLayer) as error_encountered. api_error (fetch-level failures) is
// handled separately in dashboard-site-header.client.ts, which already owns
// the one globalThis.$fetch override for the dashboard surface — see that
// file's comment for why a second override here would be fragile.
//
// trackError() is a no-op on tenant/Saya pages (gated inside useAnalytics via
// isPlatform), so this plugin is safe to register unconditionally.
export default defineNuxtPlugin((nuxtApp) => {
  const { trackError } = useAnalytics()

  nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
    const message = err instanceof Error ? err.message : String(err)
    trackError('vue_error', message, info)
    console.error(err)
  }

  if (import.meta.client) {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      trackError('unhandled_rejection', message)
    })
  }
})

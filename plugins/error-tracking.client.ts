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

  const sanitizeMessage = (raw: unknown): string => {
    const str = typeof raw === 'string' ? raw : String(raw)
    // Remove potential sensitive patterns: emails, UUIDs, long tokens
    return str
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/[a-f0-9]{32,}/g, '[REDACTED_ID]')
      .slice(0, 200) // Limit length
  }

  // Use Nuxt's vue:error hook instead of overriding vueApp.config.errorHandler
  // to avoid bypassing Nuxt's built-in error pipeline
  nuxtApp.hook('vue:error', (err, _instance, info) => {
    const message = sanitizeMessage(err instanceof Error ? err.message : err)
    trackError('vue_error', message, info)
    console.error(err)
  })

  if (import.meta.client) {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const message = sanitizeMessage(reason instanceof Error ? reason.message : reason)
      trackError('unhandled_rejection', message)
    })
  }
})

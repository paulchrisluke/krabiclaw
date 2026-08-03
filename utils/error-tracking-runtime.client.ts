import { useAnalytics } from '~/composables/useAnalytics'

type ErrorTrackingNuxtApp = {
  hook: (_name: 'vue:error', _handler: (_error: unknown, _instance: unknown, _info: string | undefined) => void) => unknown
}

export function registerErrorTracking(nuxtApp: ErrorTrackingNuxtApp) {
  const { trackError } = useAnalytics()

  const sanitizeMessage = (raw: unknown): string => {
    const str = typeof raw === 'string' ? raw : String(raw)
    return str
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/[a-f0-9]{32,}/g, '[REDACTED_ID]')
      .slice(0, 200)
  }

  nuxtApp.hook('vue:error', (err, _instance, info) => {
    const message = sanitizeMessage(err instanceof Error ? err.message : err)
    trackError('vue_error', message, info)
    console.error(err)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = sanitizeMessage(reason instanceof Error ? reason.message : reason)
    trackError('unhandled_rejection', message)
  })
}

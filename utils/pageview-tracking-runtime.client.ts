import type { Ref } from 'vue'
import { normalizeReferrerHost, readAttributionParams } from '~/utils/analytics-attribution'
import { isTrackablePath } from '~/utils/pageview-path'

interface ZarazPageviewApi {
  spaPageview?: () => void
}

export function registerPageviewTracking() {
  const route = useRoute()
  if (!isTrackablePath(route.path) || route.path.startsWith('/dev')) return

  const win = window as Window & { __kc_pageview_tracking_registered?: boolean; zaraz?: ZarazPageviewApi }
  if (win.__kc_pageview_tracking_registered) return

  const { isTenant, isPlatform } = useTenantSite()
  if (!isTenant && !isPlatform) return
  win.__kc_pageview_tracking_registered = true

  const { $appLocale } = useNuxtApp() as { $appLocale?: Ref<string> }
  if (isTenant && !$appLocale) throw new Error('Application locale provider is unavailable')

  const router = useRouter()
  let currentEventId = crypto.randomUUID()
  let currentPath = router.currentRoute.value.path
  let currentFullPath = router.currentRoute.value.fullPath
  let pageEnteredAt = Date.now()
  let durationSent = false

  const send = (payload: Record<string, unknown>) => {
    try {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // First-party analytics never blocks the public experience.
    }
  }

  const pageviewPayload = (initial: boolean) => {
    const attribution = readAttributionParams(new URLSearchParams(window.location.search))
    const referrerHost = initial ? normalizeReferrerHost(document.referrer) : null
    return {
      eventId: currentEventId,
      eventType: 'pageview',
      pagePath: currentPath,
      ...(isTenant && $appLocale ? { locale: $appLocale.value } : {}),
      ...(referrerHost ? { referrerHost } : {}),
      ...(Object.keys(attribution).length > 0 ? { attribution } : {}),
    }
  }

  const sendDuration = () => {
    if (durationSent || !isTrackablePath(currentPath)) return
    const durationSeconds = Math.round((Date.now() - pageEnteredAt) / 1000)
    if (durationSeconds <= 0) return
    durationSent = true
    const payload = JSON.stringify({
      eventId: currentEventId,
      eventType: 'duration',
      pagePath: currentPath,
      durationSeconds,
      ...(isTenant && $appLocale ? { locale: $appLocale.value } : {}),
    })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/track', new Blob([payload], { type: 'application/json' }))
      } else {
        send(JSON.parse(payload) as Record<string, unknown>)
      }
    } catch {
      // Duration is best effort and tied to the exact page event UUID.
    }
  }

  send(pageviewPayload(true))

  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath || to.fullPath === currentFullPath) return
    sendDuration()
    currentEventId = crypto.randomUUID()
    currentPath = to.path
    currentFullPath = to.fullPath
    pageEnteredAt = Date.now()
    durationSent = false
    if (isTrackablePath(currentPath)) {
      send(pageviewPayload(false))
      try {
        win.zaraz?.spaPageview?.()
      } catch {
        // Zaraz is an optional consent-gated mirror.
      }
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDuration()
  })
  window.addEventListener('pagehide', sendDuration)
}

// Client-side pageview tracking for SPA route changes on public tenant
// (Saya) pages and platform pages (krabiclaw.com itself).
import { isPlatformPath } from '~/utils/platform-routes'

export function registerPageviewTracking() {
  const route = useRoute()

  if (route.path.startsWith('/auth') || route.path.startsWith('/admin') || route.path.startsWith('/dev')) return

  const pluginKey = '__kc_pageview_tracking_registered'
  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
  if (win && win[pluginKey]) return
  if (win) win[pluginKey] = true

  const { isTenant, isPlatform, siteId } = useTenantSite()
  if (!isTenant && !isPlatform) return
  if (isTenant && !siteId) return

  const identity = isTenant ? { siteId } : { platform: true }
  const router = useRouter()
  let pageEnteredAt = Date.now()
  let currentPath = router.currentRoute.value.fullPath
  let lastTrackedPath: string | null = currentPath
  let durationSent = false
  let trackGa4PageView: ((_path: string, _title: string) => void) | null = null
  let trackGa4TimeOnPage: ((_path: string, _durationSeconds: number) => void) | null = null

  if (isPlatform) {
    const { trackSessionStart, trackPageView, trackTimeOnPage } = useAnalytics()
    trackGa4PageView = trackPageView
    trackGa4TimeOnPage = trackTimeOnPage
    let alreadyStartedThisTab = false
    try {
      const SESSION_STARTED_KEY = 'kc_session_started'
      if (sessionStorage.getItem(SESSION_STARTED_KEY)) {
        alreadyStartedThisTab = true
      } else {
        sessionStorage.setItem(SESSION_STARTED_KEY, '1')
      }
    } catch {
      // sessionStorage unavailable (private mode / disabled) — skip the
      // once-per-tab dedupe rather than drop session_start entirely.
    }
    try {
      if (!alreadyStartedThisTab) trackSessionStart()
      trackGa4PageView(currentPath, document.title)
    } catch {
      // Analytics must never break the public site.
    }
  }

  const sendTrack = (payload: Record<string, unknown>) => {
    try {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {})
    } catch {
      // Analytics must never break the public site.
    }
  }

  const sendDurationBeacon = () => {
    const durationSeconds = Math.round((Date.now() - pageEnteredAt) / 1000)
    if (durationSeconds <= 0 || durationSent) return
    durationSent = true
    trackGa4TimeOnPage?.(currentPath, durationSeconds)
    const payload = JSON.stringify({
      ...identity,
      pagePath: currentPath,
      eventType: 'duration',
      durationSeconds
    })

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics/track', new Blob([payload], { type: 'application/json' }))
    } else {
      sendTrack({ ...identity, pagePath: currentPath, eventType: 'duration', durationSeconds })
    }
  }

  router.afterEach((to, from) => {
    if (to.fullPath === from.fullPath || to.fullPath === lastTrackedPath) return
    if (isTenant && isPlatformPath(to.path)) return

    trackGa4PageView?.(to.fullPath, document.title)
    sendDurationBeacon()
    pageEnteredAt = Date.now()
    currentPath = to.fullPath
    lastTrackedPath = currentPath
    durationSent = false

    sendTrack({
      ...identity,
      pagePath: currentPath,
      referrer: from.fullPath ? `${window.location.origin}${from.fullPath}` : document.referrer,
      userAgent: navigator.userAgent
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDurationBeacon()
  })
  window.addEventListener('pagehide', sendDurationBeacon)
}

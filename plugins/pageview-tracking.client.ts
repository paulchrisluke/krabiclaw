// Client-side pageview tracking for SPA route changes on public tenant
// (Saya) pages and platform pages (krabiclaw.com itself).
//
// - router.afterEach fires the pageview ping after navigation completes, so the
//   route's own content/data fetches are never delayed by analytics.
// - visibilitychange/pagehide + sendBeacon is used only to report time-on-page
//   for the page that's being left, never as a pageview trigger itself.
// - All calls fail silently — analytics must never break the public site.
import { isPlatformPath } from '~/utils/platform-routes'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  
  // Early exit for auth/admin/dev routes that don't need pageview tracking
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
  let isInitialRoute = true
  let lastTrackedPath: string | null = null

  // GA4 product-event tracking (zaraz.track()) is platform-only and has no
  // server-side initial-load recording the way /api/analytics/track does, so
  // unlike the site_events pageview below, this needs to fire for the very
  // first route too, not just subsequent SPA navigations. trackGa4PageView
  // stays null on tenant pages so the afterEach hook below is a no-op there.
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
    if (durationSeconds <= 0) return

    trackGa4TimeOnPage?.(currentPath, durationSeconds)

    // pagePath pins the update to the page being measured — the beacon and the
    // next page's pageview fetch race each other, so this must not depend on
    // "most recent row" ordering on the server.
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

  // Initial SSR-rendered pageview is already recorded server-side by
  // zz-pageview-tracking.ts — only track subsequent client-side navigations here.
  router.afterEach((to, from) => {
    // Skip the first afterEach invocation, which is the initial hydration navigation
    // that SSR already recorded.
    if (isInitialRoute) {
      isInitialRoute = false
      return
    }
    if (to.fullPath === from.fullPath) return
    if (to.fullPath === lastTrackedPath) return

    // If this is a platform route (e.g. /docs, /blog, /pricing) and we're
    // currently in tenant context, don't record it against the tenant site.
    if (isTenant && isPlatformPath(to.path)) return

    trackGa4PageView?.(to.fullPath, document.title)

    // Report duration for the page we're leaving, then start the new page's clock.
    sendDurationBeacon()
    pageEnteredAt = Date.now()
    currentPath = to.fullPath
    lastTrackedPath = currentPath

    sendTrack({
      ...identity,
      pagePath: currentPath,
      referrer: from.fullPath ? `${window.location.origin}${from.fullPath}` : document.referrer,
      userAgent: navigator.userAgent
    })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendDurationBeacon()
    }
  })

  window.addEventListener('pagehide', sendDurationBeacon)
})

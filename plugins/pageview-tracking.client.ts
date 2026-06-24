// Client-side pageview tracking for SPA route changes on public tenant
// (Saya) pages and platform pages (krabiclaw.com itself).
//
// - router.afterEach fires the pageview ping after navigation completes, so the
//   route's own content/data fetches are never delayed by analytics.
// - visibilitychange/pagehide + sendBeacon is used only to report time-on-page
//   for the page that's being left, never as a pageview trigger itself.
// - All calls fail silently — analytics must never break the public site.
export default defineNuxtPlugin(() => {
  const { isTenant, isPlatform, siteId } = useTenantSite()
  if (!isTenant && !isPlatform) return
  if (isTenant && !siteId) return

  const identity = isTenant ? { siteId } : { platform: true }

  const router = useRouter()
  let pageEnteredAt = Date.now()
  let currentPath = router.currentRoute.value.fullPath

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
    if (to.fullPath === from.fullPath) return

    // Report duration for the page we're leaving, then start the new page's clock.
    sendDurationBeacon()
    pageEnteredAt = Date.now()
    currentPath = to.fullPath

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

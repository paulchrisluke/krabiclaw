import type { Ref } from 'vue'
import { normalizeReferrerHost, readAttributionParams } from '~/utils/analytics-attribution'
import { isTrackablePath } from '~/utils/pageview-path'

interface ZarazPageviewApi {
  spaPageview?: () => void
}

interface TrackedPage {
  eventId: string
  path: string
  fullPath: string
  enteredAt: number
  durationSent: boolean
  pageviewReady: Promise<boolean>
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
  const send = async (payload: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        keepalive: true,
      })
      return response.ok
    } catch {
      // First-party analytics never blocks the public experience.
      return false
    }
  }

  const pageviewPayload = (page: TrackedPage, initial: boolean) => {
    const attribution = readAttributionParams(new URLSearchParams(window.location.search))
    const referrerHost = initial ? normalizeReferrerHost(document.referrer) : null
    return {
      eventId: page.eventId,
      eventType: 'pageview',
      pagePath: page.path,
      ...(isTenant && $appLocale ? { locale: $appLocale.value } : {}),
      ...(referrerHost ? { referrerHost } : {}),
      ...(Object.keys(attribution).length > 0 ? { attribution } : {}),
    }
  }

  const sendDuration = (page: TrackedPage) => {
    if (page.durationSent || !isTrackablePath(page.path)) return
    const durationSeconds = Math.round((Date.now() - page.enteredAt) / 1000)
    if (durationSeconds <= 0) return
    page.durationSent = true
    const payload = JSON.stringify({
      eventId: page.eventId,
      eventType: 'duration',
      pagePath: page.path,
      durationSeconds,
      ...(isTenant && $appLocale ? { locale: $appLocale.value } : {}),
    })
    void page.pageviewReady.then((pageviewRecorded) => {
      if (!pageviewRecorded) return
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/analytics/track', new Blob([payload], { type: 'application/json' }))
        } else {
          void send(JSON.parse(payload) as Record<string, unknown>)
        }
      } catch {
        // Duration is best effort and tied to the exact page event UUID.
      }
    })
  }

  let currentPage: TrackedPage = {
    eventId: crypto.randomUUID(),
    path: router.currentRoute.value.path,
    fullPath: router.currentRoute.value.fullPath,
    enteredAt: Date.now(),
    durationSent: false,
    pageviewReady: Promise.resolve(false),
  }
  currentPage.pageviewReady = send(pageviewPayload(currentPage, true))

  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath || to.fullPath === currentPage.fullPath) return
    const previousPage = currentPage
    sendDuration(previousPage)
    const nextPage: TrackedPage = {
      eventId: crypto.randomUUID(),
      path: to.path,
      fullPath: to.fullPath,
      enteredAt: Date.now(),
      durationSent: false,
      pageviewReady: Promise.resolve(false),
    }
    currentPage = nextPage
    if (isTrackablePath(nextPage.path)) {
      nextPage.pageviewReady = previousPage.pageviewReady.then(() => send(pageviewPayload(nextPage, false)))
      try {
        win.zaraz?.spaPageview?.()
      } catch {
        // Zaraz is an optional consent-gated mirror.
      }
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDuration(currentPage)
  })
  window.addEventListener('pagehide', () => sendDuration(currentPage))
}

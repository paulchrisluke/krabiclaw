import type { RouteLocationNormalized } from 'vue-router'
import { normalizeReferrerHost, readAttributionParams } from '~/utils/analytics-attribution'
import { isTrackablePath } from '~/utils/pageview-path'

interface ZarazPageviewApi {
  spaPageview?: () => void
}

/**
 * One observed page visit. Everything an event says about the visit is captured here, at the moment
 * the navigation is observed: a payload built later would read the next route's query string.
 */
interface TrackedPage {
  eventId: string
  path: string
  fullPath: string
  enteredAt: number
  durationSent: boolean
  /** The pageview request, fixed when the navigation was observed. Null when the route is not tracked. */
  pageview: Record<string, unknown> | null
  /** Resolves true only when the collector persisted this exact event. */
  pageviewReady: Promise<boolean>
}

const isTracked = (path: string) => isTrackablePath(path) && !path.startsWith('/dev')

let observedPage: TrackedPage | null = null

/**
 * The pageview event of the page the visitor is on, for an interaction or a form submission to
 * name as the visit it happened on. Null when this page is not tracked. The collector believes the
 * claim only when it recorded that pageview for this same visitor session.
 */
export function currentPageEventId(): string | null {
  return observedPage?.pageview ? observedPage.eventId : null
}

export function registerPageviewTracking() {
  const win = window as Window & { __kc_pageview_tracking_registered?: boolean; zaraz?: ZarazPageviewApi }
  if (win.__kc_pageview_tracking_registered) return

  const { isTenant, isPlatform } = useTenantOrganization()
  if (!isTenant && !isPlatform) return
  win.__kc_pageview_tracking_registered = true

  const nuxtApp = useNuxtApp()
  const router = useRouter()

  // The collector answers `ignored` for a request it deliberately does not record (a known bot), and
  // an error for one it could not. Neither is a persisted event. A failure is reported through the
  // application's own error hook — the one the error tracker already listens to — and never breaks
  // the page the visitor is on.
  const send = async (payload: Record<string, unknown>): Promise<boolean> => {
    const response = await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!response.ok) throw new Error(`Analytics collection was rejected (${response.status})`)
    const result = await response.json() as { ignored?: boolean }
    return result.ignored !== true
  }
  const report = (error: unknown) => {
    void nuxtApp.callHook('vue:error', error, null, 'analytics-collector')
    return false
  }
  const deliver = (after: Promise<boolean>, payload: Record<string, unknown>) =>
    after.then(() => send(payload)).catch(report)

  // Observed at navigation time: the destination's own query parameters, its path, and the moment.
  // The referrer is the browser's for the first page only; later pages are internal navigations.
  const observe = (target: Pick<RouteLocationNormalized, 'path' | 'fullPath'>, initial: boolean): TrackedPage => {
    const eventId = crypto.randomUUID()
    const page: TrackedPage = {
      eventId, path: target.path, fullPath: target.fullPath, enteredAt: Date.now(),
      durationSent: false, pageview: null, pageviewReady: Promise.resolve(false),
    }
    if (!isTracked(target.path)) return page
    const attribution = readAttributionParams(new URL(target.fullPath, window.location.origin).searchParams)
    const referrerHost = initial ? normalizeReferrerHost(document.referrer) : null
    page.pageview = {
      eventId,
      eventType: 'pageview',
      pagePath: target.path,
      occurredAt: new Date(page.enteredAt).toISOString(),
      ...(referrerHost ? { referrerHost } : {}),
      ...(Object.keys(attribution).length > 0 ? { attribution } : {}),
    }
    return page
  }

  const sendDuration = (page: TrackedPage) => {
    if (page.durationSent || !page.pageview) return
    const durationSeconds = Math.round((Date.now() - page.enteredAt) / 1000)
    if (durationSeconds <= 0) return
    page.durationSent = true
    const payload = JSON.stringify({ eventId: page.eventId, eventType: 'duration', pagePath: page.path, durationSeconds })
    void page.pageviewReady.then((recorded) => {
      if (!recorded) return
      // Exact-event duration: a beacon survives the page going away; without one the same request is sent.
      if (navigator.sendBeacon?.('/api/analytics/track', new Blob([payload], { type: 'application/json' }))) return
      return send(JSON.parse(payload) as Record<string, unknown>).catch(report)
    })
  }

  // Tracking is registered whatever the first route is: landing on an excluded internal route must
  // not stop a later public navigation from being recorded.
  let currentPage = observe(router.currentRoute.value, true)
  observedPage = currentPage
  if (currentPage.pageview) currentPage.pageviewReady = deliver(Promise.resolve(true), currentPage.pageview)

  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath || to.fullPath === currentPage.fullPath) return
    const previousPage = currentPage
    sendDuration(previousPage)
    const nextPage = observe(to, false)
    currentPage = nextPage
    observedPage = nextPage
    if (nextPage.pageview) {
      // Sent after the previous page's event, so the session exists before this one lands, but with
      // the payload captured now.
      nextPage.pageviewReady = deliver(previousPage.pageviewReady, nextPage.pageview)
      win.zaraz?.spaPageview?.()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDuration(currentPage)
  })
  window.addEventListener('pagehide', () => sendDuration(currentPage))
}

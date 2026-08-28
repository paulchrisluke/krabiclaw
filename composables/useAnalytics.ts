// Analytics event tracking composable
// Product analytics is sent straight to Cloudflare Zaraz's `zaraz.track()`
// API. Zaraz is edge-injected (auto-inject script, see the "Web tag
// management" Cloudflare dashboard config for krabiclaw.com) and queues
// calls made before its own snippet has loaded, the same guarantee GTM's
// dataLayer makes — so there is no app-owned queue/bridge to maintain here.
// The GA4 tool inside Zaraz has an "All Tracks" trigger that fires on every
// `zaraz.track()` call and forwards it to GA4.

declare global {
  interface Window {
    zaraz?: {
      track: (_eventName: string, _params?: Record<string, unknown>) => void
      set: (_key: string, _value: string | undefined | Record<string, string>, _options?: { scope?: 'page' | 'session' | 'persist' }) => void
      consent?: {
        APIReady?: boolean
        set: (_preferences: Record<string, boolean>) => void
        sendQueuedEvents?: () => void
      }
    }
  }
}

export type AnalyticsEventName =
  // User Acquisition & Onboarding
  | 'sign_up'
  | 'site_created'
  | 'onboarding_completed'
  | 'domain_connected'
  // Billing & Subscription
  // subscription_created/plan_upgraded/plan_downgraded/subscription_cancelled
  // fire server-side from the Better Auth Stripe event queue via
  // server/utils/stripe-ga4.ts, not from here
  // — client-side tracking can't see plan changes made through the Stripe
  // customer portal, or a checkout that completes after the tab closes.
  | 'plan_viewed'
  | 'checkout_started'
  | 'payment_method_added'
  | 'subscription_upgrade'
  | 'subscription_downgrade'
  | 'subscription_cancelled'
  | 'subscription_checkout_success'
  // Content Creation
  | 'product_created'
  | 'product_imported'
  | 'post_created'
  | 'post_published'
  // Media Management
  | 'image_uploaded'
  | 'video_uploaded'
  | 'media_generated'
  | 'media_library_viewed'
  // Feature Usage
  | 'chowbot_interaction'
  | 'dashboard_visited'
  | 'editor_session_started'
  // Engagement
  | 'session_start'
  | 'page_view'
  | 'time_on_page'
  // Error & Technical
  | 'error_encountered'
  | 'api_error'

// Event-specific fields that don't belong to the structured page/location/
// metadata groups below — everything here rides along under `properties`.
export interface AnalyticsEventProperties {
  [key: string]: string | number | boolean | undefined

  // User Acquisition
  method?: string // 'oauth_google', 'oauth_github', 'email'
  domain?: string

  // Billing
  plan?: string // 'free' or 'growth'
  value?: number // monetary value in cents
  currency?: string

  // Content
  content_type?: string // 'page', 'product', 'post'
  content_id?: string
  import_method?: string // 'ai', 'manual', 'csv'

  // Media
  media_type?: string // 'image', 'video'
  provider?: string // 'cloudflare_images', 'cloudflare_r2'
  file_size?: number
  generation_prompt?: string

  // Feature Usage
  dashboard_section?: string // 'billing', 'content', 'settings', etc.

  // Engagement
  duration_seconds?: number

  // Error
  error_type?: string
  error_message?: string
  error_context?: string
  api_endpoint?: string
  status_code?: number
}

// trackEvent()'s input: AnalyticsEventProperties plus the handful of fields
// that get lifted into their own page/location/metadata groups instead of
// staying in the flat properties bag — see trackEvent() below.
export interface AnalyticsEventInput extends AnalyticsEventProperties {
  site_id?: string
  template?: string
  page_path?: string
  page_title?: string
  page_language?: string
  location_id?: string
}

// Reads the GA4 client_id out of the `_ga` cookie Zaraz's GA4 tool sets
// client-side (same cookie/format gtag.js itself would set:
// `GA1.1.<random>.<timestamp>`; client_id is the last two segments).
// Used to stitch server-side Stripe webhook events back to the browsing
// session that started checkout — see server/utils/ga4-measurement-protocol.ts.
function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseGaClientId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)_ga=([^;]+)/)
  if (!match) return null
  const parts = decodeCookieValue(match[1] ?? '').split('.')
  if (parts.length < 4) return null
  return `${parts[2]}.${parts[3]}`
}

export function parseGaSessionId(cookieHeader: string): number | null {
  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=')
    if (!rawName?.startsWith('_ga_')) continue
    const value = decodeCookieValue(rawValue.join('='))
    const firstSessionSegment = value.match(/^GS\d+\.\d+\.(\d+)/)?.[1]
      ?? value.match(/(?:^|[$.])s(\d+)(?:[$.]|$)/)?.[1]
      ?? value.split('.').find((part, index) => index >= 2 && /^\d+$/.test(part))
    const sessionId = Number(firstSessionSegment)
    if (Number.isSafeInteger(sessionId) && sessionId > 0) return sessionId
  }
  return null
}

export const getGaClientId = (): string | null => {
  if (!import.meta.client) return null
  return parseGaClientId(document.cookie)
}

export const getGaSessionId = (): number | null => {
  if (!import.meta.client) return null
  return parseGaSessionId(document.cookie)
}

export const getGaSessionCapturedAt = (): number | null => {
  return getGaSessionId() ? Math.floor(Date.now() / 1000) : null
}

export interface BillingAnalyticsContext {
  gaClientId?: string
  gaSessionId?: string
  gaSessionCapturedAt?: number
}

export const getBillingAnalyticsContext = (): BillingAnalyticsContext => {
  const gaClientId = getGaClientId()
  const gaSessionId = getGaSessionId()
  const gaSessionCapturedAt = gaSessionId ? getGaSessionCapturedAt() : null
  return {
    ...(gaClientId ? { gaClientId } : {}),
    ...(gaSessionId ? { gaSessionId: String(gaSessionId) } : {}),
    ...(gaSessionCapturedAt ? { gaSessionCapturedAt } : {}),
  }
}

export const useAnalytics = () => {
  const { isPlatform } = useTenantSite()

  // Builds a structured payload instead of one flat params bag, so it reads
  // the same way it's queried later: page/location/metadata are recognizable
  // groups, not properties mixed in with everything else. `event` itself
  // isn't duplicated inside the payload — it's already `zaraz.track()`'s
  // first argument, unlike the old krabiLayer array where every queued item
  // needed its own `name` field to stay identifiable once flattened into one
  // list. `metadata` is for values that are essentially constant for a given
  // request (environment, site, device language) — event-specific data goes
  // in `properties`. Extend with `transaction`/`products` groups the same
  // way if/when e-commerce events are added.
  const trackEvent = (eventName: AnalyticsEventName, input: AnalyticsEventInput = {}) => {
    if (!import.meta.client) return
    if (typeof window === 'undefined') return
    if (!isPlatform) return

    const { site_id, template, page_path, page_title, page_language, location_id, ...properties } = input

    const flatParams: Record<string, unknown> = {
      ...(page_path ? { page_path } : {}),
      ...(page_title ? { page_title } : {}),
      ...(page_language ? { page_language } : {}),
      ...(location_id ? { location_id } : {}),
      ...(site_id ? { site_id } : {}),
      ...(template ? { template } : {}),
      device_language: navigator.language,
      is_prod: import.meta.env.PROD,
      ...properties,
    }

    window.zaraz?.track(eventName, flatParams)
  }

  // User Acquisition & Onboarding
  const trackSignUp = (method: string) => {
    trackEvent('sign_up', { method })
  }

  const trackSiteCreated = (siteId: string) => {
    trackEvent('site_created', { site_id: siteId })
  }

  const trackOnboardingCompleted = (siteId: string) => {
    trackEvent('onboarding_completed', { site_id: siteId })
  }

  const trackDomainConnected = (domain: string, siteId: string) => {
    trackEvent('domain_connected', { domain, site_id: siteId })
  }

  // Billing & Subscription
  const trackPlanViewed = (plan?: string) => {
    trackEvent('plan_viewed', { plan })
  }

  const trackCheckoutStarted = (plan: string, value?: number) => {
    trackEvent('checkout_started', { plan, value, currency: 'USD' })
  }

  const trackPaymentMethodAdded = () => {
    trackEvent('payment_method_added', {})
  }

  const setUserId = (userId: string | null | undefined) => {
    if (!import.meta.client || typeof window === 'undefined') return
    window.zaraz?.set('user_id', userId ?? undefined, { scope: 'session' })
  }

  const trackSubscriptionUpgrade = (plan: string, value?: number) => {
    trackEvent('subscription_upgrade', { plan, value, currency: 'USD' })
  }

  const trackSubscriptionDowngrade = (plan: string) => {
    trackEvent('subscription_downgrade', { plan })
  }

  const trackSubscriptionCheckoutSuccess = (plan?: string) => {
    trackEvent('subscription_checkout_success', { plan })
  }

  // Content Creation
  const trackProductCreated = (contentId: string, siteId: string) => {
    trackEvent('product_created', { content_id: contentId, site_id: siteId, content_type: 'product' })
  }

  const trackProductsImported = (siteId: string, importMethod: string) => {
    trackEvent('product_imported', { site_id: siteId, import_method: importMethod })
  }

  const trackPostCreated = (contentId: string, siteId: string) => {
    trackEvent('post_created', { content_id: contentId, site_id: siteId, content_type: 'post' })
  }

  const trackPostPublished = (contentId: string, siteId: string) => {
    trackEvent('post_published', { content_id: contentId, site_id: siteId, content_type: 'post' })
  }

  // Media Management
  const trackImageUploaded = (siteId: string, fileSize: number, provider: string) => {
    trackEvent('image_uploaded', { site_id: siteId, file_size: fileSize, provider, media_type: 'image' })
  }

  const trackVideoUploaded = (siteId: string, fileSize: number, provider: string) => {
    trackEvent('video_uploaded', { site_id: siteId, file_size: fileSize, provider, media_type: 'video' })
  }

  const trackMediaGenerated = (siteId: string, prompt: string) => {
    trackEvent('media_generated', { site_id: siteId, generation_prompt: prompt.substring(0, 100) })
  }

  const trackMediaLibraryViewed = (siteId: string) => {
    trackEvent('media_library_viewed', { site_id: siteId })
  }

  // Feature Usage
  const trackDashboardVisited = (section: string, siteId?: string) => {
    trackEvent('dashboard_visited', { dashboard_section: section, site_id: siteId })
  }

  const trackChowbotInteraction = (siteId?: string) => {
    trackEvent('chowbot_interaction', { site_id: siteId })
  }

  const trackEditorSessionStarted = (siteId: string) => {
    trackEvent('editor_session_started', { site_id: siteId })
  }

  // Engagement
  const trackSessionStart = () => {
    trackEvent('session_start', {})
  }

  const trackPageView = (path: string, title: string) => {
    trackEvent('page_view', { page_path: path, page_title: title })
  }

  const trackTimeOnPage = (path: string, durationSeconds: number) => {
    trackEvent('time_on_page', { page_path: path, duration_seconds: durationSeconds })
  }

  // Error & Technical
  const trackError = (errorType: string, errorMessage: string, context?: string) => {
    trackEvent('error_encountered', { error_type: errorType, error_message: errorMessage.substring(0, 200), error_context: context })
  }

  const trackApiError = (endpoint: string, statusCode: number, errorMessage?: string) => {
    trackEvent('api_error', { api_endpoint: endpoint, status_code: statusCode, error_message: errorMessage?.substring(0, 200) })
  }

  return {
    trackEvent,
    trackSignUp,
    trackSiteCreated,
    trackOnboardingCompleted,
    trackDomainConnected,
    trackPlanViewed,
    trackCheckoutStarted,
    trackPaymentMethodAdded,
    trackSubscriptionUpgrade,
    trackSubscriptionDowngrade,
    trackSubscriptionCheckoutSuccess,
    setUserId,
    getBillingAnalyticsContext,
    trackProductCreated,
    trackProductsImported,
    trackPostCreated,
    trackPostPublished,
    trackImageUploaded,
    trackVideoUploaded,
    trackMediaGenerated,
    trackMediaLibraryViewed,
    trackDashboardVisited,
    trackChowbotInteraction,
    trackEditorSessionStarted,
    trackSessionStart,
    trackPageView,
    trackTimeOnPage,
    trackError,
    trackApiError,
  }
}

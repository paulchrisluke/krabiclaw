// Product analytics is sent through the edge-injected Cloudflare Zaraz API.
// The configured GA4 tool mirrors `zaraz.track()` events while its consent
// purpose is granted by the visitor in ZarazConsentNotice.

import { parseGaClientId, parseGaSessionId } from '~/utils/ga-cookies'
import { ZARAZ_ANALYTICS_PURPOSE_ID } from '~/utils/zaraz-consent'

declare global {
  interface Window {
    zaraz?: {
      track: (_eventName: string, _params?: Record<string, unknown>) => void
      ecommerce?: (_eventName: string, _params?: Record<string, unknown>) => void
      set: (_key: string, _value: string | undefined | Record<string, string>, _options?: { scope?: 'page' | 'session' | 'persist' }) => void
      consent?: {
        APIReady?: boolean
        modal: boolean
        set: (_preferences: Record<string, boolean>) => void
        getAll: () => Record<string, boolean>
        sendQueuedEvents: () => void
      }
    }
  }
}

export type AnalyticsEventName =
  // User Acquisition & Onboarding
  // sign_up and onboarding_complete are recorded by the server when the
  // registration and the onboarding transition commit (server/utils/auth.ts,
  // organization-provisioning.ts); this composable never emits them.
  | 'organization_created'
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
  organization_id?: string
  template?: string
  page_path?: string
  page_title?: string
  page_language?: string
  location_id?: string
}

// Reads the GA4 client_id out of the `_ga` cookie Zaraz's GA4 tool sets.
// The client_id is the last two segments of `GA1.1.<random>.<timestamp>`.
// Used to stitch server-side Stripe webhook events back to the browsing
// session that started checkout — see server/utils/ga4-delivery.ts.
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

// GA identifiers are read only while the visitor has accepted analytics; an identifier is not consent.
export const getBillingAnalyticsContext = (): BillingAnalyticsContext => {
  if (!import.meta.client || window.zaraz?.consent?.getAll()[ZARAZ_ANALYTICS_PURPOSE_ID] !== true) return {}
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
  const { isPlatform } = useTenantOrganization()

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

    const { organization_id, template, page_path, page_title, page_language, location_id, ...properties } = input

    const flatParams: Record<string, unknown> = {
      ...(page_path ? { page_path } : {}),
      ...(page_title ? { page_title } : {}),
      ...(page_language ? { page_language } : {}),
      ...(location_id ? { location_id } : {}),
      ...(organization_id ? { organization_id } : {}),
      ...(template ? { template } : {}),
      device_language: navigator.language,
      is_prod: import.meta.env.PROD,
      ...properties,
    }

    window.zaraz?.track(eventName, flatParams)
  }

  // User Acquisition & Onboarding
  const trackOrganizationCreated = (organizationId: string) => {
    trackEvent('organization_created', { organization_id: organizationId })
  }

  const trackDomainConnected = (domain: string, organizationId: string) => {
    trackEvent('domain_connected', { domain, organization_id: organizationId })
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
  const trackProductCreated = (contentId: string, organizationId: string) => {
    trackEvent('product_created', { content_id: contentId, organization_id: organizationId, content_type: 'product' })
  }

  const trackProductsImported = (organizationId: string, importMethod: string) => {
    trackEvent('product_imported', { organization_id: organizationId, import_method: importMethod })
  }

  const trackPostCreated = (contentId: string, organizationId: string) => {
    trackEvent('post_created', { content_id: contentId, organization_id: organizationId, content_type: 'post' })
  }

  const trackPostPublished = (contentId: string, organizationId: string) => {
    trackEvent('post_published', { content_id: contentId, organization_id: organizationId, content_type: 'post' })
  }

  // Media Management
  const trackImageUploaded = (organizationId: string, fileSize: number, provider: string) => {
    trackEvent('image_uploaded', { organization_id: organizationId, file_size: fileSize, provider, media_type: 'image' })
  }

  const trackVideoUploaded = (organizationId: string, fileSize: number, provider: string) => {
    trackEvent('video_uploaded', { organization_id: organizationId, file_size: fileSize, provider, media_type: 'video' })
  }

  const trackMediaGenerated = (organizationId: string, prompt: string) => {
    trackEvent('media_generated', { organization_id: organizationId, generation_prompt: prompt.substring(0, 100) })
  }

  const trackMediaLibraryViewed = (organizationId: string) => {
    trackEvent('media_library_viewed', { organization_id: organizationId })
  }

  // Feature Usage
  const trackDashboardVisited = (section: string, organizationId?: string) => {
    trackEvent('dashboard_visited', { dashboard_section: section, organization_id: organizationId })
  }

  const trackChowbotInteraction = (organizationId?: string) => {
    trackEvent('chowbot_interaction', { organization_id: organizationId })
  }

  const trackEditorSessionStarted = (organizationId: string) => {
    trackEvent('editor_session_started', { organization_id: organizationId })
  }

  // Engagement
  const trackSessionStart = () => {
    trackEvent('session_start', {})
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
    trackOrganizationCreated,
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
    trackTimeOnPage,
    trackError,
    trackApiError,
  }
}

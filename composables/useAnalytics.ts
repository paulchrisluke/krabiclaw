// Analytics event tracking composable
// Uses @nuxt/scripts Google Analytics integration (GA4)

declare global {
  interface Window {
    // gtag.js's real contract is variadic — 'js'+Date, 'config'+id, 'event'+name+params,
    // 'consent'+... all shipped through the same function. Narrowing this to the
    // trackEvent()-shaped 3-arg form below broke app.vue's own gtag bootstrap
    // (`gtag('js', new Date())`), which is equally legitimate usage of the same global.
    gtag?: (..._args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export type AnalyticsEventName =
  // User Acquisition & Onboarding
  | 'sign_up'
  | 'org_created'
  | 'site_created'
  | 'onboarding_completed'
  | 'domain_connected'
  // Billing & Subscription
  | 'plan_viewed'
  | 'checkout_started'
  | 'subscription_created'
  | 'plan_upgraded'
  | 'plan_downgraded'
  | 'subscription_cancelled'
  | 'payment_method_added'
  // Content Creation
  | 'page_created'
  | 'page_published'
  | 'menu_item_created'
  | 'menu_imported'
  | 'post_created'
  | 'post_published'
  // Media Management
  | 'image_uploaded'
  | 'video_uploaded'
  | 'media_generated'
  | 'media_library_viewed'
  // Feature Usage
  | 'chowbot_interaction'
  | 'mcp_tool_used'
  | 'dashboard_visited'
  | 'editor_session_started'
  | 'ai_feature_used'
  // Engagement
  | 'session_start'
  | 'page_view'
  | 'time_on_page'
  // Error & Technical
  | 'error_encountered'
  | 'api_error'

export interface AnalyticsEventParams {
  // Common params
  [key: string]: string | number | boolean | undefined

  // User Acquisition
  method?: string // 'oauth_google', 'oauth_github', 'email'
  org_id?: string
  site_id?: string
  domain?: string

  // Billing
  plan?: string // 'free', 'growth', 'managed', 'seo_accelerator'
  value?: number // monetary value in cents
  currency?: string
  previous_plan?: string

  // Content
  content_type?: string // 'page', 'menu_item', 'post'
  content_id?: string
  import_method?: string // 'ai', 'manual', 'csv'

  // Media
  media_type?: string // 'image', 'video'
  provider?: string // 'cloudflare_images', 'cloudflare_r2'
  file_size?: number
  generation_prompt?: string

  // Feature Usage
  tool_name?: string // MCP tool name
  dashboard_section?: string // 'billing', 'content', 'settings', etc.
  ai_feature?: string // 'menu_import', 'image_generation', etc.

  // Engagement
  page_path?: string
  page_title?: string
  duration_seconds?: number

  // Error
  error_type?: string
  error_message?: string
  error_context?: string
  api_endpoint?: string
  status_code?: number
}

// Reads the GA4 client_id out of the `_ga` cookie GA4's own gtag.js sets
// (format `GA1.1.<random>.<timestamp>`; client_id is the last two segments).
// Used to stitch server-side Stripe webhook events back to the browsing
// session that started checkout — see server/utils/ga4-measurement-protocol.ts.
export const getGaClientId = (): string | null => {
  if (!import.meta.client) return null
  const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/)
  if (!match) return null
  const parts = (match[1] ?? '').split('.')
  if (parts.length < 4) return null
  return `${parts[2]}.${parts[3]}`
}

export const useAnalytics = () => {
  const trackEvent = (eventName: AnalyticsEventName, params: AnalyticsEventParams = {}) => {
    if (import.meta.client) {
      // @nuxt/scripts injects gtag globally
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', eventName, params)
      }
    }
  }

  // User Acquisition & Onboarding
  const trackSignUp = (method: string) => {
    trackEvent('sign_up', { method })
  }

  const trackOrgCreated = (orgId: string) => {
    trackEvent('org_created', { org_id: orgId })
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

  const trackSubscriptionCreated = (plan: string, value: number) => {
    trackEvent('subscription_created', { plan, value, currency: 'USD' })
  }

  const trackPlanUpgraded = (plan: string, previousPlan: string, value: number) => {
    trackEvent('plan_upgraded', { plan, previous_plan: previousPlan, value, currency: 'USD' })
  }

  const trackPlanDowngraded = (plan: string, previousPlan: string) => {
    trackEvent('plan_downgraded', { plan, previous_plan: previousPlan })
  }

  const trackSubscriptionCancelled = (plan: string) => {
    trackEvent('subscription_cancelled', { plan })
  }

  const trackPaymentMethodAdded = () => {
    trackEvent('payment_method_added', {})
  }

  // Content Creation
  const trackPageCreated = (contentId: string, siteId: string) => {
    trackEvent('page_created', { content_id: contentId, site_id: siteId, content_type: 'page' })
  }

  const trackPagePublished = (contentId: string, siteId: string) => {
    trackEvent('page_published', { content_id: contentId, site_id: siteId, content_type: 'page' })
  }

  const trackMenuItemCreated = (contentId: string, siteId: string) => {
    trackEvent('menu_item_created', { content_id: contentId, site_id: siteId, content_type: 'menu_item' })
  }

  const trackMenuImported = (siteId: string, importMethod: string) => {
    trackEvent('menu_imported', { site_id: siteId, import_method: importMethod })
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
  const trackChowbotInteraction = (siteId: string) => {
    trackEvent('chowbot_interaction', { site_id: siteId })
  }

  const trackMcpToolUsed = (toolName: string, siteId?: string) => {
    trackEvent('mcp_tool_used', { tool_name: toolName, site_id: siteId })
  }

  const trackDashboardVisited = (section: string, siteId?: string) => {
    trackEvent('dashboard_visited', { dashboard_section: section, site_id: siteId })
  }

  const trackEditorSessionStarted = (siteId: string) => {
    trackEvent('editor_session_started', { site_id: siteId })
  }

  const trackAiFeatureUsed = (feature: string, siteId: string) => {
    trackEvent('ai_feature_used', { ai_feature: feature, site_id: siteId })
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
    trackOrgCreated,
    trackSiteCreated,
    trackOnboardingCompleted,
    trackDomainConnected,
    trackPlanViewed,
    trackCheckoutStarted,
    trackSubscriptionCreated,
    trackPlanUpgraded,
    trackPlanDowngraded,
    trackSubscriptionCancelled,
    trackPaymentMethodAdded,
    trackPageCreated,
    trackPagePublished,
    trackMenuItemCreated,
    trackMenuImported,
    trackPostCreated,
    trackPostPublished,
    trackImageUploaded,
    trackVideoUploaded,
    trackMediaGenerated,
    trackMediaLibraryViewed,
    trackChowbotInteraction,
    trackMcpToolUsed,
    trackDashboardVisited,
    trackEditorSessionStarted,
    trackAiFeatureUsed,
    trackSessionStart,
    trackPageView,
    trackTimeOnPage,
    trackError,
    trackApiError,
  }
}

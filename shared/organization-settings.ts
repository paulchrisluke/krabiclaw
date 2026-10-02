/**
 * Integration credentials are Better Auth linked accounts. An organization
 * never holds a token: it stores the Better Auth `account.id` that granted it
 * access beside the provider resource it selected, and reads a usable token
 * through Better Auth when it needs one. The linked account belongs to the
 * user who linked it, so removing an organization's selection — or the
 * organization — leaves that account alone.
 *
 * What each integration asks its provider for. Google scopes are requested
 * incrementally on the one linked Google account, so connecting Search Console
 * adds to what Analytics was granted rather than replacing it. Instagram's
 * scopes are fixed by its provider configuration in server/utils/auth.ts.
 */
export const INTEGRATION_SCOPES = {
  'google-analytics': ['https://www.googleapis.com/auth/analytics.readonly'],
  'google-search-console': [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/siteverification',
  ],
  // Facebook Login for Business: the configuration (FACEBOOK_CONFIG_ID) holds
  // the Page permissions and Meta rejects any scope sent beside it, so nothing
  // is requested and a linked Facebook account is matched by provider alone.
  'facebook': [],
} as const satisfies Record<string, readonly string[]>

/** The providers an organization connects, one of each. */
export const INTEGRATION_PROVIDERS = ['facebook', 'instagram', 'google_analytics', 'google_search_console'] as const
export type IntegrationProvider = typeof INTEGRATION_PROVIDERS[number]

/** One row of `organization_integrations`. */
export interface OrganizationIntegration {
  organization_id: string
  provider: IntegrationProvider
  /** The Better Auth linked account the organization acts through. */
  account_id: string
  /** Page id, Instagram professional account id, GA4 property id or Search Console site URL. */
  target_id: string
  /** Page name, Instagram username, GA4 property name or Search Console site URL. */
  target_name: string
  /** Google Analytics only. */
  measurement_id: string | null
  /** Search Console only. */
  verified: boolean | null
  /** Search Console only, while Google still requires the meta tag to be served. */
  verification_token: string | null
  revision: string
  created_at: string
  updated_at: string
}

export interface OrganizationSettings {
  config?: {
    brand_color?: string
    font_preset?: import('./organization-fonts').OrganizationFontPreset
    press_email?: string
    partnerships_email?: string
    catering_email?: string
    careers_email?: string
    default_timezone?: string
    whatsapp_phone?: string
  }
  theme_by_template?: Partial<Record<import('../utils/template-registry').PublicTemplateSlug, {
    tokens: Record<string, string>
    status: 'active' | 'disabled'
    created_at: string
    updated_at: string
    updated_by: string | null
  }>>
  consultation?: Omit<import('../types/blawby').PublicConsultationSettings, 'contact_form_enabled' | 'metadata'> & {
    metadata_json: Record<string, unknown> | null
    created_at: string
    updated_at: string
    updated_by: string | null
  }
  compliance?: Omit<import('../types/blawby').PublicCompliance, 'media' | 'metadata'> & {
    metadata_json: Record<string, unknown> | null
    created_at: string
    updated_at: string
    updated_by: string | null
  }
}

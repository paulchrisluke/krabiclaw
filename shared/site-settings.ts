export interface IntegrationVersion {
  revision: string | null
}

export interface IntegrationOAuthState extends IntegrationVersion {
  organizationId: string
  organizationId: string
  userId: string
  timestamp: number
}

/**
 * One Google account, connected once.
 *
 * The credential used to live inside a single `google` integration that also
 * carried the GA4 property and the Search Console url, discriminated by a
 * `kind` of 'oauth' or 'manual'. That made one row answer three questions, so a
 * tenant who had only pasted a measurement id was represented as a credential
 * with no credentials in it. The credential is its own key now, and each Google
 * product that uses it is its own key beside it.
 */
export interface GoogleCredential {
  revision: string
  id: string
  connected_by_user_id?: string
  provider_account_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  /** Union of the scopes granted across every connected Google product. */
  scopes: string
  status: 'active' | 'disabled' | 'error'
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface GoogleAnalyticsIntegration {
  revision: string
  /** Absent on a site whose measurement id predates the OAuth property picker. */
  property_id?: string
  property_name?: string
  measurement_id: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface GoogleSearchConsoleIntegration {
  revision: string
  site_url: string
  verified: boolean
  /** Retained only while Google still requires the meta tag to be served. */
  verification_token?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface FacebookIntegration {
  revision: string
  id: string
  connected_by_user_id: string
  facebook_user_id: string
  page_id: string
  page_name: string
  encrypted_user_token: string
  encrypted_page_token?: string
  user_token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface InstagramIntegration {
  revision: string
  id: string
  connected_by_user_id: string
  instagram_user_id: string
  username: string
  encrypted_access_token: string
  token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface SiteIntegrations {
  google_credential?: GoogleCredential
  google_analytics?: GoogleAnalyticsIntegration
  google_search_console?: GoogleSearchConsoleIntegration
  facebook?: FacebookIntegration
  instagram?: InstagramIntegration
}

export interface SiteSettings {
  config?: {
    brand_color?: string
    font_preset?: import('./site-fonts').SiteFontPreset
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

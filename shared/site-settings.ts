export interface IntegrationVersion {
  revision: string | null
}

export interface IntegrationOAuthState extends IntegrationVersion {
  siteId: string
  organizationId: string
  userId: string
  timestamp: number
}

export interface FacebookIntegration {
  kind: 'oauth'
  revision: string
  id: string
  connected_by_user_id: string
  facebook_user_id: string
  facebook_page_id?: string
  facebook_page_name?: string
  encrypted_user_token: string
  encrypted_page_token?: string
  user_token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface GoogleOAuthIntegration {
  kind: 'oauth'
  revision: string
  id: string
  connected_by_user_id?: string
  provider_account_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  scopes: string
  ga4_property_id?: string
  ga4_property_name?: string
  ga4_measurement_id?: string
  search_console_site_url?: string
  status: 'active' | 'disabled' | 'error'
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface GoogleManualIntegration {
  kind: 'manual'
  status: 'active' | 'disabled'
  revision: string
  ga4_measurement_id?: string | null
  updated_at: string
}

export interface SiteIntegrations {
  facebook?: FacebookIntegration
  google?: GoogleOAuthIntegration | GoogleManualIntegration
}

export interface SiteSettings {
  config?: {
    brand_color?: string
    font_preset?: import('./site-fonts').SiteFontPreset
    press_email?: string
    partnerships_email?: string
    catering_email?: string
    careers_email?: string
    google_site_verification?: string
    default_timezone?: string
    whatsapp_phone?: string
    owner_notification_channels?: Array<'email' | 'whatsapp'>
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

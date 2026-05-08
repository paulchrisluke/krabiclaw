// Site management types

export interface SiteSettings {
  id: string
  organization_id: string
  site_id: string
  name: string
  subdomain: string
  theme: string
  status: 'active' | 'pending' | 'failed'
  primary_location_id: string | null
  public_url: string
  custom_domain_status: 'none' | 'pending' | 'active' | 'failed'
  brand_name: string
  brand_description: string | null
  logo_url: string | null
  contact_email: string | null
  url_structure: 'location_subdirectories' | 'brand_pages'
  last_published_at: string | null
  created_at: string
  updated_at: string
}

export interface UpdateSiteSettingsRequest {
  name?: string
  brand_name?: string
  brand_description?: string
  logo_url?: string
  contact_email?: string
  primary_location_id?: string
  url_structure?: 'location_subdirectories' | 'brand_pages'
}

export interface LaunchReadiness {
  site_id: string
  overall_ready: boolean
  missing_critical: number
  missing_optional: number
  sections: {
    site_identity: {
      ready: boolean
      items: {
        name: boolean
        subdomain: boolean
        theme: boolean
        status: boolean
        primary_location: boolean
      }
    }
    brand_basics: {
      ready: boolean
      items: {
        brand_name: boolean
        description: boolean
        contact_email: boolean
      }
    }
    publishing_status: {
      ready: boolean
      items: {
        site_active: boolean
        public_url: boolean
        last_published: boolean
      }
    }
    domain_status: {
      ready: boolean
      items: {
        subdomain: boolean
        custom_domain: boolean
      }
    }
    integrations: {
      ready: boolean
      items: {
        google_business_connected: boolean
        locations_imported: boolean
      }
    }
    content_readiness: {
      ready: boolean
      items: {
        homepage_hero: boolean
        menu_exists: boolean
        menu_items_exist: boolean
        contact_details: boolean
        locations_exist: boolean
        seo_metadata: boolean
      }
    }
  }
  action_items: Array<{
    section: string
    item: string
    priority: 'critical' | 'optional'
    description: string
    action_url?: string
  }>
}

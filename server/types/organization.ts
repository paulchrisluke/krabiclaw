// Site management types

import type { DomainStatus } from '~/server/utils/domains'
import type { CurrencyCode } from '~/shared/currencies'
import type { OrganizationFontPreset } from '~/shared/organization-fonts'

export type { CurrencyCode }

/**
 * The one universal announcement modal, available to every theme. An image comes through `media`
 * (slot `announcement`), never a URL stored here. `enabled: false` or a missing config both mean
 * nothing shows; the CMS writes `null` to remove it entirely rather than leaving stale content off.
 */
export interface OrganizationAnnouncement {
  headline: string
  description: string | null
  cta_label: string | null
  cta_url: string | null
  dismissible: boolean
  enabled: boolean
}

export interface OrganizationSettings {
  id: string
  organization_id: string
  subdomain: string
  theme: string
  status: 'active' | 'inactive' | 'suspended'
  public_url: string | null
  custom_domain_status: DomainStatus | 'none'
  name: string
  brand_description: string | null
  announcement: OrganizationAnnouncement | null
  media: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string }>
  contact_email: string | null
  brand_color: string
  font_preset: OrganizationFontPreset
  // null until the owner has chosen one. Surfaces that quote a price refuse to
  // render rather than showing an amount in a currency nobody picked.
  default_currency: CurrencyCode | null
  google_analytics_measurement_id?: string
  created_at: string
  updated_at: string
}

export interface UpdateOrganizationSettingsRequest {
  name?: string
  /**
   * The website's publication state, and the only one there is. A tenant moves
   * between 'active' (Live) and 'inactive' (Draft); 'suspended' is Krabiclaw's
   * and is rejected here. server/utils/organization-settings.ts enforces it.
   */
  status?: 'active' | 'inactive'
  brand_description?: string
  // A full replacement of the announcement, or null to remove it entirely. There is no partial
  // patch: the CMS leaf edits every field together, the same way the old banner did.
  announcement?: { headline: string; description?: string | null; cta_label?: string | null; cta_url?: string | null; dismissible?: boolean; enabled?: boolean } | null
  contact_email?: string
  brand_color?: string
  font_preset?: OrganizationFontPreset
  default_currency?: CurrencyCode
  press_email?: string
  partnerships_email?: string
  catering_email?: string
  careers_email?: string
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
  media?: Array<{ asset_id: string | null; slot: 'logo' | 'favicon' | 'social_share' | 'announcement' }>
  // Additive/subtractive delta on top of the vertical's own module defaults (config/cms-registry.ts
  // ProductFeature ids) — null clears the override back to defaults.
  feature_overrides?: { enabled?: string[]; disabled?: string[] } | null
}

export interface LaunchReadiness {
  organization_id: string
  overall_ready: boolean
  missing_critical: number
  missing_optional: number
  sections: {
    organization_identity: {
      ready: boolean
      items: {
        name: boolean
        subdomain: boolean
        theme: boolean
        status: boolean
        locations: boolean
      }
    }
    brand_basics: {
      ready: boolean
      items: {
        name: boolean
        description: boolean
        contact_email: boolean
      }
    }
    publishing_status: {
      ready: boolean
      items: {
        organization_active: boolean
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
        google_places_configured: boolean
        locations_imported: boolean
      }
    }
    content_readiness: {
      ready: boolean
      items: {
        homepage_hero: boolean
        products_exist: boolean
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

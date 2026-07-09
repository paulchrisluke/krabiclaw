export interface PublicOffering {
  id: string
  name: string
  slug: string
  label: string | null
  summary: string | null
  short_description: string | null
  body: string | null
  features: string[]
  faqs: Array<{ question: string; answer: string }>
  cta_label: string | null
  cta_url: string | null
  thumbnail_url: string | null
  hero_image_url: string | null
  media: Array<{ id: string; url: string; kind: string; alt_text: string | null }>
  schema_type: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_path: string | null
  status: string
  sort_order: number
  featured: boolean
}

export interface PublicTenantPage {
  id: string
  path: string
  title: string
  page_type: string
  summary: string | null
  body: string | null
  components: ApiRecord[]
  cta_label: string | null
  cta_url: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  sort_order: number
}

export interface PublicConsultationSettings {
  mode: 'external_url' | 'native_disabled'
  cta_label: string
  external_url: string | null
  schedule_path: string
  confirmation_path: string
  tracking_enabled: boolean
  metadata: ApiRecord
}

export interface PublicCompliance {
  entity_name: string | null
  dba_name: string | null
  entity_type: string | null
  nonprofit_status: string | null
  registration_number: string | null
  service_area: string | null
  disclaimer: string | null
  footer_disclaimer: string | null
  document_asset_ids: string[]
  documents: Array<{ id: string; url: string; label: string | null; file_name: string | null }>
  metadata: ApiRecord
}

export interface PublicNavigationItem {
  id: string
  area: 'header' | 'footer' | 'legal' | 'social'
  label: string
  url: string
  item_type: string
  sort_order: number
  metadata: ApiRecord
}

export interface PublicBlawbyData {
  offerings: PublicOffering[]
  tenantPages: PublicTenantPage[]
  compliance: PublicCompliance | null
  consultation: PublicConsultationSettings
  navigation: PublicNavigationItem[]
  themeTokens: ApiRecord
}

export interface PublicOfferingFeature {
  title: string
  description: string
  image_url: string | null
  icon: string | null
  icon_url: string | null
  sort_order: number
}

export interface PublicOffering {
  id: string
  name: string
  slug: string
  label: string | null
  summary: string | null
  short_description: string | null
  body: string | null
  features: PublicOfferingFeature[]
  faqs: Array<{ question: string; answer: string }>
  cta_label: string | null
  cta_url: string | null
  thumbnail_url: string | null
  hero_image_url: string | null
  media: Array<{ id: string; url: string; kind: string; alt_text: string | null; width: number | null; height: number | null }>
  schema_type: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_path: string | null
  status: string
  sort_order: number
  featured: boolean
}

export type BlawbyShieldVariant = 'about' | 'blog' | 'contact' | 'pricing' | 'schedule' | 'confirmation' | 'donate' | 'privacy' | 'terms' | 'third-party-notices'

export interface PublicOfferingLink {
  id: string
  name: string
  slug: string
  canonical_path: string
}

export interface PublicOfferingSummary {
  id: string
  name: string
  slug: string
  label: string | null
  summary: string | null
  short_description: string | null
  thumbnail_url: string | null
  canonical_path: string
  sort_order: number
  featured: boolean
}

export interface PublicSiteQa {
  id: string
  question: string
  answer: string | null
  sort_order: number
}

export interface PublicSiteReview {
  id: string
  author_name: string
  reviewer_photo_url: string | null
  rating: number
  title: string | null
  content: string
  original_review_date: string | null
  verified: boolean
}

export interface PublicBlogSummary {
  id: string
  title: string
  slug: string
  excerpt: string | null
  category: string | null
  tags: string[]
  featured_order: number | null
  author_name: string | null
  author_image: string | null
  published_at: string | null
  canonical_url: string
  featured_image: {
    public_url: string
    width: number | null
    height: number | null
  } | null
}

export interface PublicBlogPost extends PublicBlogSummary {
  body: string
  seo_description: string | null
  canonical_url: string
  robots: string | null
  created_at: string | null
  updated_at: string | null
  components: ApiRecord[]
}

export type BlawbyRouteRecipe =
  | 'home'
  | 'services'
  | 'offering'
  | 'about'
  | 'pricing'
  | 'contact'
  | 'schedule'
  | 'blog'
  | 'article'
  | 'donate'
  | 'privacy'
  | 'terms'
  | 'third-party-notices'

export interface PublicBlawbyRouteData {
  recipe: BlawbyRouteRecipe
  page: PublicTenantPage | null
  offerings: PublicOfferingSummary[]
  offering: PublicOffering | null
  qa: PublicSiteQa[]
  reviews: PublicSiteReview[]
  posts: PublicBlogSummary[]
  post: PublicBlogPost | null
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
  contact_form_enabled: boolean
  metadata: ApiRecord
}

export interface PublicComplianceContactPoint {
  contact_type: string | null
  telephone: string | null
  email: string | null
  area_served: string | null
  available_language: string[] | string | null
  url: string | null
}

export interface PublicCompliance {
  entity_name: string | null
  dba_name: string | null
  entity_type: string | null
  /** Raw stored value — already normalized to a schema.org enum URL (e.g. https://schema.org/Nonprofit501c3) by the canonical write layer. */
  nonprofit_status: string | null
  registration_number: string | null
  service_area: string | null
  /** schema.org areaServed @type, e.g. 'State', 'City', 'Country'. */
  service_area_type: string | null
  disclaimer: string | null
  footer_disclaimer: string | null
  document_asset_ids: string[]
  documents: Array<{ id: string; url: string | null; label: string | null; file_name: string | null }>
  founder_name: string | null
  founding_date: string | null
  same_as: string[]
  contact_points: PublicComplianceContactPoint[]
  address_visibility: 'visible' | 'hidden'
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

export interface PublicBlawbyIdentity {
  brand_name: string | null
  brand_description: string | null
  logo_url: string | null
  phone: string | null
  banner_content: string | null
  banner_dismissible: boolean
}

export interface PublicBlawbyShellData {
  identity: PublicBlawbyIdentity
  navigation: PublicNavigationItem[]
  consultation: PublicConsultationSettings
  compliance: PublicCompliance | null
  themeTokens: ApiRecord
  offeringLinks: PublicOfferingLink[]
}

export interface PublicBlawbyData {
  offerings: PublicOffering[]
  tenantPages: PublicTenantPage[]
  compliance: PublicCompliance | null
  consultation: PublicConsultationSettings
  navigation: PublicNavigationItem[]
  themeTokens: ApiRecord
}

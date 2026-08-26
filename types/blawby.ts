export interface PublicOfferingFeature {
  title: string
  description: string
  icon: string | null
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
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string; alt_text: string | null; width: number | null; height: number | null }>
  schema_type: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_path: string
  sort_order: number
  featured: boolean
  /** Real business_locations data for this offering's own location (offerings.location_id), when one is set. Null for site-wide offerings. */
  location_address_street: string | null
  location_address_locality: string | null
}

export type BlawbyShieldVariant = 'about' | 'blog' | 'contact' | 'pricing' | 'schedule' | 'confirmation' | 'donate' | 'privacy' | 'terms' | 'third-party-notices'

export interface PublicOfferingLink {
  id: string
  name: string
  slug: string
  canonical_path: string
}

export interface PublicBlawbyPageLink {
  id: string
  path: string
  title: string
}

export interface PublicOfferingSummary {
  id: string
  name: string
  slug: string
  label: string | null
  summary: string | null
  short_description: string | null
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string; alt_text: string | null }>
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
  media: Array<{ asset_id: string; slot: string; public_url: string; thumbnail_url: string | null; kind: string; alt_text: string | null }>
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
  published_at: string | null
  canonical_url: string
  media: Array<{
    asset_id: string
    slot: string
    public_url: string
    thumbnail_url: string | null
    kind: string | null
    width: number | null
    height: number | null
  }>
}

export interface PublicBlogPost extends PublicBlogSummary {
  body: string
  author: { id: string; name: string | null; image: string | null } | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string
  robots: string | null
  visibility: 'public' | 'unlisted'
  created_at: string | null
  updated_at: string | null
  content_blocks: import('~/lib/components/workspace/blog/types').BlogEditorBlock[]
}

export const BLAWBY_ROUTE_RECIPES = [
  'home',
  'links',
  'services',
  'offering',
  'about',
  'pricing',
  'contact',
  'confirmation',
  'schedule',
  'blog',
  'article',
  'donate',
  'privacy',
  'terms',
  'third-party-notices',
] as const

export type BlawbyRouteRecipe = typeof BLAWBY_ROUTE_RECIPES[number]

export const BLAWBY_SHELL_ONLY_ROUTE_RECIPES = ['links'] as const

export type BlawbyShellOnlyRouteRecipe = typeof BLAWBY_SHELL_ONLY_ROUTE_RECIPES[number]

export function isBlawbyShellOnlyRouteRecipe(recipe: BlawbyRouteRecipe): recipe is BlawbyShellOnlyRouteRecipe {
  return (BLAWBY_SHELL_ONLY_ROUTE_RECIPES as readonly string[]).includes(recipe)
}

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
  recipe: string | null
  locale: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  blocks: import('~/utils/tenant-page-blocks').TenantPageBlock[]
  updated_at: string
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
  media: Array<{
    asset_id: string
    slot: string
    public_url: string | null
    kind: string | null
    alt_text: string | null
    file_name: string | null
  }>
  founder_name: string | null
  founding_date: string | null
  same_as: string[]
  contact_points: PublicComplianceContactPoint[]
  address_visibility: 'visible' | 'hidden'
  address: {
    street_address: string | null
    locality: string | null
    region: string | null
    postal_code: string | null
    country: string | null
  } | null
  metadata: ApiRecord
}

export interface PublicBlawbyIdentity {
  brand_name: string
  brand_description: string | null
  media: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string | null }>
  phone: string | null
  banner_content: string | null
  banner_dismissible: boolean
  /** The site's primary business_locations row's address, when publicly configured. */
  primary_location_address_street: string | null
  primary_location_address_locality: string | null
}

export interface PublicBlawbyShellData {
  identity: PublicBlawbyIdentity
  consultation: PublicConsultationSettings
  compliance: PublicCompliance | null
  themeTokens: ApiRecord
  offeringLinks: PublicOfferingLink[]
  pageLinks: PublicBlawbyPageLink[]
}

export interface PublicBlawbyData {
  offerings: PublicOffering[]
  tenantPages: PublicTenantPage[]
  compliance: PublicCompliance | null
  consultation: PublicConsultationSettings
  themeTokens: ApiRecord
}

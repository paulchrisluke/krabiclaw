export interface SeedPublicRouteExpectation {
  path: string
  title: RegExp
  text: string
}

export interface CuratedSiteIdentity {
  fixtureId: string
  organizationId: string
  siteId: string
}

export interface CuratedMediaPlacement<Slot extends string = string> {
  asset_id: string
  slot: Slot
}

export interface CuratedSiteDefinition extends CuratedSiteIdentity {
  site: {
    slug: string
    subdomain: string
    brandName: string
    media: CuratedMediaPlacement<'logo' | 'logo_dark' | 'favicon'>[]
    themeId: string
    theme: string
    brandDescription: string
    status: 'active' | 'inactive'
    onboardingStatus: 'pending' | 'active' | 'failed'
    primaryLocationId: string
    contactEmail: string | null
    contactPhone?: string | null
    publicUrl: string
    defaultCurrency: string
    vertical: 'restaurant' | 'experience' | 'service' | 'professional_service'
  }
  siteConfig: CuratedSiteConfigEntry[]
  siteLocales: CuratedSiteLocaleDefinition[]
  siteDomains: CuratedSiteDomainDefinition[]
  locations: CuratedLocationDefinition[]
  mediaAssets: CuratedMediaAssetDefinition[]
  tenantPageContent: CuratedTenantPageContentDefinition[]
  experiences: CuratedExperienceDefinition[]
  reviews: CuratedReviewDefinition[]
  products: CuratedProductDefinition[]
  locationQa: CuratedLocationQaDefinition[]
  posts: CuratedPostDefinition[]
  tenantPageLocaleFields?: CuratedTenantPageLocaleFieldDefinition[]
  businessLocationTranslations?: CuratedBusinessLocationTranslationDefinition[]
  publicRoutes: SeedPublicRouteExpectation[]
  aiCredits?: {
    balance: number
    lifetimeUsed?: number
  }
  organizationBilling?: {
    status: string
    plan: 'free' | 'growth'
  }
}

export interface CuratedSiteConfigEntry {
  key: string
  value: string
}

export interface CuratedSiteLocaleDefinition {
  id: string
  locale: string
  label: string
  isSource: boolean
  status: 'published' | 'disabled'
}

export interface CuratedSiteDomainDefinition {
  id: string
  domain: string
  type: 'subdomain' | 'custom'
  role: 'canonical' | 'secondary'
  status: 'pending' | 'verifying' | 'active' | 'blocked' | 'failed' | 'disabled' | 'deleted'
  dnsStatus: 'pending' | 'valid' | 'invalid' | 'unknown'
}

export interface CuratedLocationDefinition {
  id: string
  slug: string
  title: string
  city: string
  address: {
    addressLines: string[]
    locality: string
    administrativeArea: string
    postalCode: string
    country: string
  } | null
  phone: string | null
  email: string | null
  mapsUrl: string
  latitude: number
  longitude: number
  description: string
  shortDescription: string
  openingHours: Array<{
    openDay: string
    openTime: string
    closeTime: string
  }>
  rating: number | null
  reviewCount: number | null
  // Set only when rating/reviewCount reflect a real, verified Google Places
  // sync (matches the last_synced_at gate in bootstrap.get.ts) — never fill
  // these in without a real place_id, or the public reviews UI will treat
  // fabricated numbers as a verified aggregate.
  googlePlaceId?: string | null
  lastSyncedAt?: string | null
  priceLevel: string
  categories: string[]
  instagramUrl: string
  facebookUrl: string
  isPrimary: boolean
  status: 'active' | 'inactive' | 'sync_error'
  media: CuratedMediaPlacement<'hero' | 'gallery'>[]
  notificationPhone?: string | null
}

interface CuratedMediaAssetDefinitionBase {
  id: string
  provider?: 'cloudflare_r2' | 'cloudflare_images'
  source?: 'uploaded'
  r2Key?: string | null
  cloudflareImageId?: string | null
  publicUrl: string
  mimeType: string
  fileName: string
  altText: string
  category: 'food' | 'interior' | 'exterior' | 'team' | 'other'
}

export type CuratedMediaAssetDefinition = CuratedMediaAssetDefinitionBase & (
  | { kind?: 'image'; thumbnailUrl: string | null }
  | { kind: 'video'; thumbnailUrl: string }
)

export interface CuratedTenantPageContentDefinition {
  id: string
  locationId: string | null
  page: string
  field: string
  content: string | null
  type: 'text' | 'textarea' | 'richtext' | 'media'
  source?: 'manual' | 'generated'
  heroTitle?: string | null
  heroSubtitle?: string | null
  media: CuratedMediaPlacement<'media' | 'gallery'>[]
}

export interface CuratedExperienceDefinition {
  id: string
  locationId: string
  title: string
  slug: string
  tagline: string
  body: string
  media: CuratedMediaPlacement<'gallery'>[]
  tags?: string[]
  details?: Array<{
    key: string
    label: string
    values: string[]
  }>
  includedItems?: string[] | null
  whatToBring?: string[] | null
  meetingPoint?: string | null
  cancellationPolicy?: string | null
  price: string
  priceAmount: number | null
  durationMinutes: number | null
  maxCapacity: number | null
  timeSlots: string[]
  status: 'active' | 'inactive' | 'sold_out'
  sortOrder: number
  featured: boolean
  featuredSortOrder: number
  seoTitle: string
  seoDescription: string
}

export interface CuratedReviewDefinition {
  id: string
  locationId: string
  authorName: string
  rating: number
  content: string
  ownerReply: string | null
  ownerReplyAt: string | null
  status: 'pending' | 'approved' | 'rejected'
  source: 'google' | 'manual' | 'tripadvisor'
}

export interface CuratedProductDefinition {
  id: string
  locationId: string
  category: string
  name: string
  slug: string
  description: string
  priceAmount: number
  media: CuratedMediaPlacement<'image' | 'gallery'>[]
  allergens: string | null
  dietaryNotes: string | null
  available: boolean
  sortOrder: number
  featured?: boolean
  featuredSortOrder?: number
}

export interface CuratedLocationQaDefinition {
  id: string
  locationId: string
  question: string
  questionAuthor: string
  answer: string
  answerAuthor: string
  isOwnerAnswer: boolean
  upvoteCount: number
  source: 'manual' | 'import' | 'template'
  status: 'published' | 'pending' | 'rejected'
  sortOrder: number
}

export interface CuratedPostChannelJobDefinition {
  id: string
  channel: string
  status: 'published' | 'pending' | 'failed'
  publishedAt: string
}

export interface CuratedPostDefinition {
  id: string
  locationId: string | null
  postType: 'update' | 'standard' | 'offer' | 'event'
  title: string | null
  body: string
  ctaType?: string | null
  ctaUrl?: string | null
  eventTitle?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  offerCoupon?: string | null
  offerTerms?: string | null
  media: CuratedMediaPlacement<'cover' | 'gallery'>[]
  status: 'published' | 'scheduled'
  publishedAt: string
  createdBy: string
  channelJobs: CuratedPostChannelJobDefinition[]
}

export interface CuratedTenantPageLocaleFieldDefinition {
  id: string
  locationId: string | null
  locale: string
  page: string
  field: string
  content: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
  value: string | null
  type: 'text' | 'textarea' | 'richtext' | 'media'
  status: 'published' | 'stale'
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

export interface CuratedBusinessLocationTranslationDefinition {
  id: string
  locationId: string
  locale: string
  title: string | null
  address: string | null
  city: string | null
  description: string | null
  shortDescription: string | null
  status: 'published' | 'stale'
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

// Compiled/normalized interfaces

interface CompiledSeedMediaAssetBase {
  id: string
  organizationId: string
  siteId: string
  provider: 'cloudflare_r2' | 'cloudflare_images'
  source: 'uploaded'
  r2Key: string | null
  cloudflareImageId: string | null
  publicUrl: string
  mimeType: string
  fileName: string
  altText: string
  category: CuratedMediaAssetDefinition['category']
  status: 'active'
}

export type CompiledSeedMediaAsset = CompiledSeedMediaAssetBase & (
  | { kind: 'image'; thumbnailUrl: string | null }
  | { kind: 'video'; thumbnailUrl: string }
)

export interface CompiledSeedTenantPageContent {
  id: string
  organizationId: string
  siteId: string
  locationId: string | null
  page: string
  field: string
  content: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  media: CuratedMediaPlacement<'media' | 'gallery'>[]
  type: CuratedTenantPageContentDefinition['type']
  source: 'manual' | 'generated'
}

export interface CompiledSeedExperience {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  title: string
  slug: string
  tagline: string
  body: string
  media: CuratedMediaPlacement<'gallery'>[]
  tags: string[]
  details: Array<{
    key: string
    label: string
    values: string[]
  }>
  includedItems: string[] | null
  whatToBring: string[] | null
  meetingPoint: string | null
  cancellationPolicy: string | null
  price: string
  priceAmount: number | null
  durationMinutes: number | null
  maxCapacity: number | null
  timeSlots: string[]
  status: CuratedExperienceDefinition['status']
  sortOrder: number
  featured: boolean
  featuredSortOrder: number
  seoTitle: string
  seoDescription: string
}

export interface CompiledSeedReview {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  authorName: string
  rating: number
  content: string
  ownerReply: string | null
  ownerReplyAt: string | null
  status: CuratedReviewDefinition['status']
  source: CuratedReviewDefinition['source']
}

export interface CompiledSeedProduct {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  category: string
  name: string
  slug: string
  description: string
  priceAmount: number
  media: CuratedMediaPlacement<'image' | 'gallery'>[]
  allergens: string | null
  dietaryNotes: string | null
  available: boolean
  sortOrder: number
  featured: boolean
  featuredSortOrder: number
}

export interface CompiledSeedLocationQa {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  question: string
  questionAuthor: string
  answer: string
  answerAuthor: string
  isOwnerAnswer: boolean
  upvoteCount: number
  source: CuratedLocationQaDefinition['source']
  status: CuratedLocationQaDefinition['status']
  sortOrder: number
}

export interface CompiledSeedPostChannelJob {
  id: string
  postId: string
  organizationId: string
  channel: string
  status: CuratedPostChannelJobDefinition['status']
  publishedAt: string
}

export interface CompiledSeedPost {
  id: string
  organizationId: string
  siteId: string
  locationId: string | null
  postType: CuratedPostDefinition['postType']
  title: string | null
  body: string
  ctaType: string | null
  ctaUrl: string | null
  eventTitle: string | null
  eventStartAt: string | null
  eventEndAt: string | null
  offerCoupon: string | null
  offerTerms: string | null
  media: CuratedMediaPlacement<'cover' | 'gallery'>[]
  status: CuratedPostDefinition['status']
  publishedAt: string
  createdBy: string
  channelJobs: CompiledSeedPostChannelJob[]
}

export interface CompiledSeedTenantPageLocaleField {
  id: string
  organizationId: string
  siteId: string
  locationId: string | null
  locale: string
  page: string
  field: string
  content: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  value: string | null
  type: CuratedTenantPageLocaleFieldDefinition['type']
  status: CuratedTenantPageLocaleFieldDefinition['status']
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

export interface CompiledSeedBusinessLocationTranslation {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  locale: string
  title: string | null
  address: string | null
  city: string | null
  description: string | null
  shortDescription: string | null
  status: CuratedBusinessLocationTranslationDefinition['status']
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

export interface CompiledCuratedSiteBundle {
  identity: CuratedSiteIdentity
  site: CuratedSiteDefinition['site']
  siteConfig: CuratedSiteConfigEntry[]
  siteLocales: CuratedSiteLocaleDefinition[]
  siteDomains: CuratedSiteDomainDefinition[]
  locations: CuratedLocationDefinition[]
  mediaAssets: CompiledSeedMediaAsset[]
  tenantPageContent: CompiledSeedTenantPageContent[]
  experiences: CompiledSeedExperience[]
  reviews: CompiledSeedReview[]
  products: CompiledSeedProduct[]
  locationQa: CompiledSeedLocationQa[]
  posts: CompiledSeedPost[]
  tenantPageLocaleFields: CompiledSeedTenantPageLocaleField[]
  businessLocationTranslations: CompiledSeedBusinessLocationTranslation[]
  publicRoutes: SeedPublicRouteExpectation[]
  routeManifest: {
    locations: string[]
    experiences: string[]
  }
  aiCredits?: {
    balance: number
    lifetimeUsed: number
  }
  organizationBilling?: {
    status: string
    plan: 'free' | 'growth'
  }
}

export interface SerializedSeedPublicRouteExpectation {
  path: string
  titlePattern: string
  titleFlags: string
  text: string
}

export interface SerializedCompiledCuratedSiteBundle
  extends Omit<CompiledCuratedSiteBundle, 'publicRoutes'> {
  publicRoutes: SerializedSeedPublicRouteExpectation[]
}

export interface CompiledSeedProductCategory {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  name: string
  slug: string
  sortOrder: number
}

/**
 * Derives the product_categories rows a seed needs from the category names its
 * Products carry. IDs are derived from the location and slug rather than
 * generated, so re-running a seed produces the same rows.
 *
 * Category order follows first appearance in Product sort order, which is how
 * the flat pre-category seeds already read on the public site.
 */
export function buildSeedProductCategories(
  products: Pick<CompiledSeedProduct, 'id' | 'organizationId' | 'siteId' | 'locationId' | 'category' | 'sortOrder'>[],
): { categories: CompiledSeedProductCategory[]; categoryIdByProductId: Map<string, string>; sortOrderByProductId: Map<string, number> } {
  const categories: CompiledSeedProductCategory[] = []
  const byKey = new Map<string, CompiledSeedProductCategory>()
  const categoryIdByProductId = new Map<string, string>()
  // sort_order is per category now, so it restarts at zero inside each one.
  const sortOrderByProductId = new Map<string, number>()
  const positionByCategory = new Map<string, number>()
  const sortOrderByLocation = new Map<string, number>()
  for (const product of [...products].sort((a, b) => a.locationId.localeCompare(b.locationId) || a.sortOrder - b.sortOrder)) {
    const key = `${product.locationId}::${product.category}`
    let category = byKey.get(key)
    if (!category) {
      const slug = product.category
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (!slug) throw new Error(`Product category "${product.category}" does not produce a usable slug`)
      const sortOrder = sortOrderByLocation.get(product.locationId) ?? 0
      sortOrderByLocation.set(product.locationId, sortOrder + 1)
      category = { id: `category-${product.locationId}-${slug}`, organizationId: product.organizationId, siteId: product.siteId, locationId: product.locationId, name: product.category, slug, sortOrder }
      byKey.set(key, category)
      categories.push(category)
    }
    categoryIdByProductId.set(product.id, category.id)
    const position = positionByCategory.get(category.id) ?? 0
    positionByCategory.set(category.id, position + 1)
    sortOrderByProductId.set(product.id, position)
  }
  return { categories, categoryIdByProductId, sortOrderByProductId }
}

/**
 * Experiences all sit in one category per location, scoped to
 * product_type 'experience' so it never collides with a menu section of the
 * same name. IDs are derived, so re-running a seed produces the same rows.
 */
export function buildSeedExperienceCategories(
  experiences: { locationId: string; id: string }[],
  identity: { organizationId: string; siteId: string },
): { categories: CompiledSeedProductCategory[]; categoryIdForLocation: (_locationId: string) => string; sortOrderFor: (_id: string) => number } {
  const categoryIdForLocation = (locationId: string) => `category-${locationId}-experience-experiences`
  const seen = new Set<string>()
  const categories: CompiledSeedProductCategory[] = []
  for (const experience of experiences) {
    if (seen.has(experience.locationId)) continue
    seen.add(experience.locationId)
    categories.push({
      id: categoryIdForLocation(experience.locationId),
      organizationId: identity.organizationId,
      siteId: identity.siteId,
      locationId: experience.locationId,
      name: 'Experiences',
      slug: 'experiences',
      sortOrder: 0,
    })
  }
  const positionByLocation = new Map<string, number>()
  const sortOrderById = new Map<string, number>()
  for (const experience of experiences as { locationId: string; id: string }[]) {
    const position = positionByLocation.get(experience.locationId) ?? 0
    positionByLocation.set(experience.locationId, position + 1)
    sortOrderById.set(experience.id, position)
  }
  return { categories, categoryIdForLocation, sortOrderFor: (id: string) => sortOrderById.get(id) ?? 0 }
}

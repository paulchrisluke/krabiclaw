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

export interface CuratedSiteDefinition extends CuratedSiteIdentity {
  site: {
    slug: string
    subdomain: string
    brandName: string
    logoAssetId?: string | null
    themeId: string
    theme: string
    brandDescription: string
    status: 'active' | 'inactive'
    plan: 'free' | 'growth'
    onboardingStatus: 'pending' | 'active' | 'failed'
    primaryLocationId: string
    contactEmail: string | null
    contactPhone?: string | null
    publicUrl: string
    defaultCurrency: string
    vertical: 'restaurant' | 'experience' | 'service' | 'professional_service'
    contentSource: 'generated' | 'imported' | 'manual' | 'google_maps'
    mediaSource: 'stock' | 'client' | 'mixed' | 'client_photos'
  }
  siteConfig: CuratedSiteConfigEntry[]
  siteLocales: CuratedSiteLocaleDefinition[]
  siteDomains: CuratedSiteDomainDefinition[]
  locations: CuratedLocationDefinition[]
  mediaAssets: CuratedMediaAssetDefinition[]
  tenantPageContent: CuratedTenantPageContentDefinition[]
  experiences: CuratedExperienceDefinition[]
  reviews: CuratedReviewDefinition[]
  menus: CuratedMenuDefinition[]
  locationQa: CuratedLocationQaDefinition[]
  posts: CuratedPostDefinition[]
  tenantPageLocaleFields?: CuratedTenantPageLocaleFieldDefinition[]
  businessLocationTranslations?: CuratedBusinessLocationTranslationDefinition[]
  menuTranslations?: CuratedMenuTranslationDefinition[]
  menuItemTranslations?: CuratedMenuItemTranslationDefinition[]
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
  heroImageAssetId?: string | null
  heroVideoAssetId?: string | null
  notificationPhone?: string | null
}

interface CuratedMediaAssetDefinitionBase {
  id: string
  locationId: string | null
  provider?: 'external_url' | 'cloudflare_r2' | 'cloudflare_images'
  source?: 'external' | 'uploaded'
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
  heroImageAssetId?: string | null
  heroVideoAssetId?: string | null
}

export interface CuratedExperienceDefinition {
  id: string
  locationId: string
  title: string
  slug: string
  tagline: string
  body: string
  imageAssetId: string
  highlights?: string[] | null
  includedItems?: string[] | null
  whatToBring?: string[] | null
  meetingPoint?: string | null
  cancellationPolicy?: string | null
  price: string
  priceAmount: number | null
  durationMinutes: number | null
  maxCapacity: number | null
  timeSlots: string[]
  availableNote: string
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
  reviewerPhotoUrl: string
  rating: number
  content: string
  ownerReply: string | null
  ownerReplyAt: string | null
  status: 'pending' | 'approved' | 'rejected'
  source: 'google' | 'manual' | 'tripadvisor'
}

export interface CuratedMenuItemDefinition {
  id: string
  section: string
  name: string
  slug: string
  description: string
  priceAmount: number
  imageAssetId: string | null
  allergens: string | null
  dietaryNotes: string | null
  available: boolean
  sortOrder: number
}

export interface CuratedMenuDefinition {
  id: string
  locationId: string
  name: string
  description: string
  sectionOrder: string[]
  status: 'published'
  items: CuratedMenuItemDefinition[]
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
  postType: 'update' | 'standard' | 'offer'
  title: string | null
  body: string
  imageAssetId: string | null
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

export interface CuratedMenuTranslationDefinition {
  id: string
  menuId: string
  locale: string
  name: string | null
  description: string | null
  sectionOrder: string[] | null
  status: 'published' | 'stale'
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

export interface CuratedMenuItemTranslationDefinition {
  id: string
  menuItemId: string
  locale: string
  section: string | null
  name: string | null
  description: string | null
  allergens: string | null
  dietaryNotes: string | null
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
  locationId: string | null
  provider: 'external_url' | 'cloudflare_r2' | 'cloudflare_images'
  source: 'external' | 'uploaded'
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
  heroImageAssetId: string | null
  heroVideoAssetId: string | null
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
  imageAssetId: string
  highlights: string[] | null
  includedItems: string[] | null
  whatToBring: string[] | null
  meetingPoint: string | null
  cancellationPolicy: string | null
  price: string
  priceAmount: number | null
  durationMinutes: number | null
  maxCapacity: number | null
  timeSlots: string[]
  availableNote: string
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
  reviewerPhotoUrl: string
  rating: number
  content: string
  ownerReply: string | null
  ownerReplyAt: string | null
  status: CuratedReviewDefinition['status']
  source: CuratedReviewDefinition['source']
}

export interface CompiledSeedMenuItem {
  id: string
  menuId: string
  organizationId: string
  siteId: string
  section: string
  name: string
  slug: string
  description: string
  priceAmount: number
  imageAssetId: string | null
  allergens: string | null
  dietaryNotes: string | null
  available: boolean
  sortOrder: number
}

export interface CompiledSeedMenu {
  id: string
  organizationId: string
  siteId: string
  locationId: string
  name: string
  description: string
  sectionOrder: string[]
  status: CuratedMenuDefinition['status']
  items: CompiledSeedMenuItem[]
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
  imageAssetId: string | null
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

export interface CompiledSeedMenuTranslation {
  id: string
  organizationId: string
  siteId: string
  menuId: string
  locale: string
  name: string | null
  description: string | null
  sectionOrder: string[] | null
  status: CuratedMenuTranslationDefinition['status']
  sourceHash: string
  translatedAt: string | null
  reviewedAt: string | null
}

export interface CompiledSeedMenuItemTranslation {
  id: string
  organizationId: string
  siteId: string
  menuItemId: string
  locale: string
  section: string | null
  name: string | null
  description: string | null
  allergens: string | null
  dietaryNotes: string | null
  status: CuratedMenuItemTranslationDefinition['status']
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
  menus: CompiledSeedMenu[]
  locationQa: CompiledSeedLocationQa[]
  posts: CompiledSeedPost[]
  tenantPageLocaleFields: CompiledSeedTenantPageLocaleField[]
  businessLocationTranslations: CompiledSeedBusinessLocationTranslation[]
  menuTranslations: CompiledSeedMenuTranslation[]
  menuItemTranslations: CompiledSeedMenuItemTranslation[]
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

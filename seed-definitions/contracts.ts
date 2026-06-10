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
    themeId: string
    theme: string
    brandDescription: string
    status: 'active' | 'inactive'
    plan: 'free' | 'starter' | 'pro' | 'enterprise'
    onboardingStatus: 'pending' | 'active' | 'failed'
    urlStructure: 'location_subdirectories' | 'flat'
    primaryLocationId: string
    contactEmail: string
    defaultCurrency: string
    vertical: 'restaurant' | 'experience' | 'retail' | 'wellness' | 'service'
    contentSource: 'generated' | 'imported' | 'manual'
    mediaSource: 'stock' | 'client' | 'mixed'
  }
  siteConfig: CuratedSiteConfigEntry[]
  siteLocales: CuratedSiteLocaleDefinition[]
  siteDomains: CuratedSiteDomainDefinition[]
  locations: CuratedLocationDefinition[]
  mediaAssets: CuratedMediaAssetDefinition[]
  siteContent: CuratedSiteContentDefinition[]
  experiences: CuratedExperienceDefinition[]
  publicRoutes: SeedPublicRouteExpectation[]
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
  status: 'draft' | 'published' | 'disabled'
  fallbackEnabled: boolean
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
  }
  phone: string
  email: string
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
  rating: number
  reviewCount: number
  priceLevel: string
  categories: string[]
  instagramUrl: string
  facebookUrl: string
  isPrimary: boolean
  status: 'active' | 'inactive' | 'sync_error'
}

export interface CuratedMediaAssetDefinition {
  id: string
  locationId: string | null
  publicUrl: string
  thumbnailUrl: string | null
  mimeType: string
  fileName: string
  altText: string
  category: 'food' | 'interior' | 'exterior' | 'team' | 'other'
}

export interface CuratedSiteContentDefinition {
  id: string
  locationId: string | null
  page: string
  field: string
  content: string
  type: 'text' | 'textarea' | 'richtext' | 'media'
  source?: 'manual' | 'generated'
}

export interface CuratedExperienceDefinition {
  id: string
  locationId: string
  title: string
  slug: string
  tagline: string
  body: string
  imageAssetId: string
  price: string
  durationMinutes: number
  maxCapacity: number
  timeSlots: string[]
  availableNote: string
  status: 'active' | 'inactive' | 'sold_out'
  sortOrder: number
  featured: boolean
  featuredSortOrder: number
  seoTitle: string
  seoDescription: string
}

export interface CompiledSeedMediaAsset {
  id: string
  organizationId: string
  siteId: string
  locationId: string | null
  kind: 'image'
  provider: 'external_url'
  source: 'external'
  publicUrl: string
  thumbnailUrl: string | null
  mimeType: string
  fileName: string
  altText: string
  category: CuratedMediaAssetDefinition['category']
  status: 'active'
}

export interface CompiledSeedSiteContent {
  id: string
  organizationId: string
  siteId: string
  locationId: string | null
  page: string
  field: string
  content: string
  heroTitle: null
  heroSubtitle: null
  heroImageAssetId: null
  type: CuratedSiteContentDefinition['type']
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
  price: string
  durationMinutes: number
  maxCapacity: number
  timeSlots: string[]
  availableNote: string
  status: CuratedExperienceDefinition['status']
  sortOrder: number
  featured: boolean
  featuredSortOrder: number
  seoTitle: string
  seoDescription: string
}

export interface CompiledCuratedSiteBundle {
  identity: CuratedSiteIdentity
  site: CuratedSiteDefinition['site']
  siteConfig: CuratedSiteConfigEntry[]
  siteLocales: CuratedSiteLocaleDefinition[]
  siteDomains: CuratedSiteDomainDefinition[]
  locations: CuratedLocationDefinition[]
  mediaAssets: CompiledSeedMediaAsset[]
  siteContent: CompiledSeedSiteContent[]
  experiences: CompiledSeedExperience[]
  publicRoutes: SeedPublicRouteExpectation[]
  routeManifest: {
    locations: string[]
    experiences: string[]
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

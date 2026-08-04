import type { RenderedBookingPolicySummary } from '~/server/utils/booking-policies'
import type { Experience } from '~/server/utils/experiences'

export interface PublicShellSite {
  brand_name: string | null
  brand_description: string | null
  logo_url: string | null
  logo_mime_type: string | null
  favicon_url: string | null
  vertical: string | null
  config: { phone: string | null } | null
}

export interface PublicShellPayload {
  site: PublicShellSite
  locations: ApiRecord[]
  config: Record<string, string>
  googleBusiness: ApiRecord
  locales: { code: string; label: string; is_source: boolean }[]
  hasExperiences: boolean
  hasMenu: boolean
}

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

export const isPublicShellPayload = (value: unknown): value is PublicShellPayload => {
  if (!isRecord(value) || !isRecord(value.site)) return false
  if (!nullableString(value.site.brand_name)) return false
  if (!nullableString(value.site.brand_description)) return false
  if (!nullableString(value.site.logo_url)) return false
  if (!nullableString(value.site.logo_mime_type)) return false
  if (!nullableString(value.site.favicon_url)) return false
  if (!nullableString(value.site.vertical)) return false
  if (value.site.config !== null && !isRecord(value.site.config)) return false
  if (isRecord(value.site.config) && !nullableString(value.site.config.phone)) return false
  if (!Array.isArray(value.locations)
    || !value.locations.every(location =>
      isRecord(location)
      && typeof location.id === 'string'
      && typeof location.slug === 'string'
      && typeof location.title === 'string')) return false
  if (!isRecord(value.config)
    || !Object.values(value.config).every(item => typeof item === 'string')) return false
  if (!isRecord(value.googleBusiness)
    || (value.googleBusiness.business !== null && !isRecord(value.googleBusiness.business))
    || !Array.isArray(value.googleBusiness.reviews)
    || !Array.isArray(value.googleBusiness.media)
    || !Array.isArray(value.googleBusiness.posts)) return false
  if (!Array.isArray(value.locales)
    || !value.locales.every(locale =>
      isRecord(locale)
      && typeof locale.code === 'string'
      && typeof locale.label === 'string'
      && typeof locale.is_source === 'boolean')) return false
  return typeof value.hasExperiences === 'boolean' && typeof value.hasMenu === 'boolean'
}

export interface PublicPagePayload {
  kind: string
  content: ApiRecord[]
  locationReviews: ApiRecord[]
  globalReviews: ApiRecord[]
  reviewsAggregate: ApiRecord | null
  reviewsList: ApiRecord[]
  photosList: ApiRecord[]
  qaList: ApiRecord[]
  postsList: ApiRecord[]
  globalPosts: ApiRecord[]
  blogList: ApiRecord[]
  blogPost: ApiRecord | null
  reservationPolicySiteDefault: RenderedBookingPolicySummary | null
  reservationPolicyByLocation: Record<string, RenderedBookingPolicySummary>
  experiencePolicySiteDefault: RenderedBookingPolicySummary | null
  experiencePolicyById: Record<string, RenderedBookingPolicySummary>
  experienceDetail: Experience | null
  experiencesList: Experience[]
  menu: ApiRecord | null
}

export const isPublicPagePayload = (
  value: unknown,
  expectedKind?: string | null,
): value is PublicPagePayload =>
  isRecord(value)
  && typeof value.kind === 'string'
  && (!expectedKind || value.kind === expectedKind)
  && Array.isArray(value.content)
  && value.content.every(item => isRecord(item) && typeof item.field === 'string')
  && Array.isArray(value.locationReviews)
  && Array.isArray(value.globalReviews)
  && value.globalReviews.every(item => isRecord(item) && typeof item.rating === 'number')
  && (value.reviewsAggregate === null || isRecord(value.reviewsAggregate))
  && Array.isArray(value.reviewsList)
  && Array.isArray(value.photosList)
  && Array.isArray(value.qaList)
  && Array.isArray(value.postsList)
  && Array.isArray(value.globalPosts)
  && value.globalPosts.every(item => isRecord(item) && typeof item.id === 'string')
  && Array.isArray(value.blogList)
  && (value.blogPost === null || isRecord(value.blogPost))
  && (value.reservationPolicySiteDefault === null || isRecord(value.reservationPolicySiteDefault))
  && isRecord(value.reservationPolicyByLocation)
  && Object.values(value.reservationPolicyByLocation).every(isRecord)
  && (value.experiencePolicySiteDefault === null || isRecord(value.experiencePolicySiteDefault))
  && isRecord(value.experiencePolicyById)
  && Object.values(value.experiencePolicyById).every(isRecord)
  && (value.experienceDetail === null || isRecord(value.experienceDetail))
  && Array.isArray(value.experiencesList)
  && value.experiencesList.every(item => isRecord(item) && typeof item.id === 'string')
  && (value.menu === null || isRecord(value.menu))

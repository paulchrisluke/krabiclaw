import { isRecord } from './api-clients'

export interface PublicLinksItem {
  id: string
  label: string
  destination: string
  status: 'active'
}

export interface PublicLinksPayload {
  site: {
    id: string
    organization_id: string
    brand_name: string | null
    brand_description: string | null
    logo_url: string | null
    template: 'saya' | 'blawby'
  }
  page: {
    path: '/links'
    title: string
    robots: string
    seo_title: string | null
    seo_description: string | null
  }
  items: PublicLinksItem[]
}

export type PublicLinksResponse = { success: true } & PublicLinksPayload

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isPublicLinksPayload(value: unknown): value is PublicLinksPayload {
  if (!isRecord(value) || !isRecord(value.site) || !isRecord(value.page) || !Array.isArray(value.items)) return false

  const site = value.site
  const page = value.page
  return typeof site.id === 'string'
    && typeof site.organization_id === 'string'
    && isNullableString(site.brand_name)
    && isNullableString(site.brand_description)
    && isNullableString(site.logo_url)
    && (site.template === 'saya' || site.template === 'blawby')
    && page.path === '/links'
    && typeof page.title === 'string'
    && typeof page.robots === 'string'
    && isNullableString(page.seo_title)
    && isNullableString(page.seo_description)
    && value.items.every(item =>
      isRecord(item)
      && typeof item.id === 'string'
      && typeof item.label === 'string'
      && typeof item.destination === 'string'
      && item.status === 'active',
    )
}

export function isPublicLinksResponse(value: unknown): value is PublicLinksResponse {
  return isRecord(value) && value.success === true && isPublicLinksPayload(value)
}

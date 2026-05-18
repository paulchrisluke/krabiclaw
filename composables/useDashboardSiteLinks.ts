import { computed, unref, type MaybeRef } from 'vue'

export interface DashboardActionLink {
  label: string
  icon?: string
  to?: string
  target?: '_blank'
  external?: boolean
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'error'
  variant?: 'solid' | 'soft' | 'outline' | 'ghost' | 'link'
  disabled?: boolean
  onClick?: () => void
}

function appendQuery(path: string, query: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.length > 0) params.set(key, value)
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export function useDashboardSiteLinks(siteId: MaybeRef<string>, sitePublicUrl?: MaybeRef<string | null | undefined>) {
  const normalizedSiteId = computed(() => String(unref(siteId) || ''))

  const paths = computed(() => {
    const base = `/dashboard/sites/${normalizedSiteId.value}`
    return {
      base,
      setup: `${base}/setup`,
      pages: `${base}/pages`,
      content: `${base}/content`,
      menu: `${base}/menu`,
      posts: `${base}/posts`,
      reviews: `${base}/reviews`,
      photos: `${base}/photos`,
      qa: `${base}/qa`,
      inbox: `${base}/inbox`,
      reservations: `${base}/reservations`,
      order: `${base}/order`,
      integrations: `${base}/integrations`,
      media: `${base}/media`,
      locations: `${base}/locations`,
      settings: `${base}/settings`
    }
  })

  function safeHttpUrl(value: unknown): string | null {
    if (!value || typeof value !== 'string') return null

    const raw = value.trim()
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

    try {
      const url = new URL(candidate)
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
    } catch {
      return null
    }
  }

  const resolvedPublicUrl = computed(() => {
    return safeHttpUrl(sitePublicUrl ? unref(sitePublicUrl) : null)
  })

  const previewLink = computed<DashboardActionLink>(() => ({
    label: 'Preview',
    icon: 'i-heroicons-arrow-top-right-on-square',
    to: resolvedPublicUrl.value || undefined,
    target: '_blank',
    external: true,
    color: 'neutral',
    variant: 'outline',
    disabled: !resolvedPublicUrl.value
  }))

  const overviewLink = computed<DashboardActionLink>(() => ({
    label: 'Overview',
    icon: 'i-heroicons-home',
    to: paths.value.base,
    color: 'neutral',
    variant: 'soft'
  }))

  function buildHeaderLinks(
    extras: DashboardActionLink[] = [],
    options: { includeOverview?: boolean; includePreview?: boolean } = {}
  ): DashboardActionLink[] {
    const links: DashboardActionLink[] = []
    if (options.includeOverview !== false) links.push(overviewLink.value)
    links.push(...extras)
    if (options.includePreview !== false) links.push(previewLink.value)
    return links
  }

  const locationPath = (locationId: string) => `${paths.value.locations}/${locationId}`
  const locationMenuPath = (locationId: string) => appendQuery(paths.value.menu, { locationId })
  const locationContentPath = (locationId: string) => appendQuery(paths.value.content, { locationId, page: 'location' })

  return {
    paths,
    overviewLink,
    previewLink,
    buildHeaderLinks,
    locationPath,
    locationMenuPath,
    locationContentPath
  }
}

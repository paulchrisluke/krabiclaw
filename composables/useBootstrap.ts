// Single SSR call — replaces every separate /locations, /google-business,
// /config, /content/{page}, /menus fetch on tenant pages.
//
// Key is derived from the current route via useBootstrapParams so that
// the page component, SayaHeader, and SayaFooter all register the SAME
// key → Nuxt deduplicates to ONE HTTP request per page load.
//
// Usage (in a page):
//   const { locations, googleBusiness, config, getField, getHero, menu,
//           menuItemsBySection, location, locationReviews } = useBootstrap()
//
// No arguments needed — params are inferred from the route.
import { onMounted, onBeforeUnmount } from 'vue'
import { useBootstrapParams, useBootstrapKey, useBootstrapUrl } from '~/composables/useBootstrapParams'

interface ContentRow {
  field: string
  content: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_public_url: string | null
  hero_kind: string | null
  hero_video_public_url: string | null
  hero_video_kind: string | null
  [key: string]: unknown
}

interface BootstrapPayload {
  locations: ApiRecord[]
  config: Record<string, string>
  googleBusiness: ApiRecord
  content: ContentRow[]
  menu: ApiRecord | null
  locationReviews: ApiRecord[]
  reviewsAggregate: ApiRecord | null
  reviewsList: ApiRecord[]
  photosList: ApiRecord[]
  qaList: ApiRecord[]
}

const emptyBootstrap = (): BootstrapPayload => ({
  locations: [],
  config: {},
  googleBusiness: { business: null, reviews: [], media: [], posts: [], syncedAt: null },
  content: [],
  menu: null,
  locationReviews: [],
  reviewsAggregate: null,
  reviewsList: [],
  photosList: [],
  qaList: [],
})

export const useBootstrap = () => {
  const { isPlatform, siteId } = useTenantSite()
  const route = useRoute()

  const params = useBootstrapParams()
  const key = useBootstrapKey(siteId, params)
  const url = useBootstrapUrl(siteId, params)

  const empty = emptyBootstrap()

  const { data, error } = (isPlatform || !siteId)
    ? { data: ref<BootstrapPayload>(empty), error: ref<Error | null>(null) }
    : useFetch<BootstrapPayload>(url, { key, default: emptyBootstrap, server: true })

  // ── Locations ─────────────────────────────────────────────
  const locations = computed(() => (data.value?.locations ?? []) as ApiRecord[])

  // ── Single location (for /locations/[slug]/* pages) ───────
  const location = computed(() => {
    if (!params.location) return null
    return locations.value.find(l => l.slug === params.location) ?? null
  })

  // ── Config ────────────────────────────────────────────────
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>)

  // ── Google Business ───────────────────────────────────────
  const googleBusiness = computed(() => data.value?.googleBusiness ?? empty.googleBusiness)

  // ── Location reviews preview (3 items) ───────────────────
  const locationReviews = computed(() => (data.value?.locationReviews ?? []) as ApiRecord[])

  // ── Full page datasets (types A / E / F) ─────────────────
  const reviewsAggregate = computed(() => (data.value?.reviewsAggregate ?? null) as ApiRecord | null)
  const reviewsList = computed(() => (data.value?.reviewsList ?? []) as ApiRecord[])
  const photosList = computed(() => (data.value?.photosList ?? []) as ApiRecord[])
  const qaList = computed(() => (data.value?.qaList ?? []) as ApiRecord[])

  // ── Content ───────────────────────────────────────────────
  const contentMap = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[]
    return rows.reduce<Record<string, ContentRow>>((acc, row) => {
      acc[row.field] = row
      return acc
    }, {})
  })

  const previewOverrides = ref<Record<string, string>>({})
  if (import.meta.client) {
    const isPreview = computed(() => route.query.preview === 'true')
    const expectedOrigin = computed(() => {
      try {
        return new URL(window.location.href).origin
      } catch {
        return null
      }
    })

    onMounted(() => {
      const handler = (e: MessageEvent) => {
        if (!isPreview.value) return
        if (!expectedOrigin.value) return
        if (e.origin !== expectedOrigin.value) return
        const msg = e.data
        if (msg?.type !== 'admin:content-update') return
        if (typeof msg.field !== 'string' || typeof msg.value !== 'string') return
        previewOverrides.value = { ...previewOverrides.value, [msg.field]: msg.value }
      }
      window.addEventListener('message', handler)
      onBeforeUnmount(() => {
        window.removeEventListener('message', handler)
      })
    })
  }

  const getField = (field: string, defaultValue: string | null = null): string | null => {
    if (Object.prototype.hasOwnProperty.call(previewOverrides.value, field)) {
      return previewOverrides.value[field] ?? null
    }
    if (['hero.title', 'hero.subtitle', 'hero.image', 'hero.video'].includes(field)) {
      const heroRow = contentMap.value['hero']
      const fieldRow = contentMap.value[field]
      if (field === 'hero.title') return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue
      if (field === 'hero.subtitle') return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue
      if (field === 'hero.image') return heroRow?.hero_public_url ?? fieldRow?.content ?? defaultValue
      if (field === 'hero.video') return heroRow?.hero_video_public_url ?? fieldRow?.content ?? defaultValue
    }
    const row = contentMap.value[field]
    if (!row) return defaultValue
    const val = row.content
    return val && val.trim() !== '' ? val : defaultValue
  }

  const getFieldStr = (field: string, defaultValue = ''): string =>
    getField(field, defaultValue) ?? defaultValue

  const getHero = (defaults = { title: '', subtitle: '', image: '', video: '' }) => {
    const row = contentMap.value['hero']
    return {
      title:     getField('hero.title',    row?.hero_title            ?? defaults.title)    ?? defaults.title,
      subtitle:  getField('hero.subtitle', row?.hero_subtitle         ?? defaults.subtitle) ?? defaults.subtitle,
      image:     getField('hero.image',    row?.hero_public_url       ?? defaults.image)    ?? defaults.image,
      video:     getField('hero.video',    row?.hero_video_public_url ?? defaults.video)    ?? defaults.video,
      imageKind: row?.hero_kind       || 'image',
      videoKind: row?.hero_video_kind || 'video',
    }
  }

  // ── Menu ──────────────────────────────────────────────────
  const menuData = computed(() => data.value?.menu ?? null)
  const menuItemsBySection = computed(() => {
    const m = menuData.value as { items?: ApiRecord[] } | null
    if (!m?.items) return {} as Record<string, ApiRecord[]>
    return m.items.reduce<Record<string, ApiRecord[]>>((acc, item) => {
      const section = (item.section as string) || 'Uncategorized'
      if (!acc[section]) acc[section] = []
      acc[section].push(item)
      return acc
    }, {})
  })

  return {
    data,
    locations,
    location,
    config,
    googleBusiness,
    locationReviews,
    reviewsAggregate,
    reviewsList,
    photosList,
    qaList,
    getField,
    getFieldStr,
    getHero,
    contentMap,
    menu: menuData,
    menuItemsBySection,
    error,
  }
}

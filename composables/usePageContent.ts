import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useFetch } from '#app'
import { getFieldDef } from '~/config/content-registry'
import type { FieldDefinition } from '~/config/content-registry'

interface ContentRow {
  page: string
  field: string
  content: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_public_url: string | null
  hero_kind: string | null
  hero_video_public_url: string | null
  hero_video_kind: string | null
  updated_at: string
}

export const usePageContent = (pageName?: string) => {
  const route = useRoute()

  const page = computed(() => {
    const name = pageName || route.path
    if (name === '/' || name === 'home') return 'home'
    return name.replace(/^\//, '').replace(/\//g, '-')
  })

  const { isPlatform, siteId } = useTenantSite()
  const { locale } = useI18n()
  const isPreview = computed(() => route.query.preview === 'true')
  const previewToken = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
  const reloadToken = computed(() => typeof route.query.t === 'string' ? route.query.t : '')
  const locationSlug = computed(() => {
    if (typeof route.query.location === 'string' && route.query.location) return route.query.location
    if (typeof route.params.slug === 'string' && route.path.startsWith('/locations/')) return route.params.slug
    return ''
  })

  const contentFetch = isPlatform || !siteId
    ? { data: ref(null), refresh: async () => undefined }
    : useFetch(() => {
        const url = `/api/public/sites/${siteId}/content/${page.value}`
        const params = new URLSearchParams()
        if (route.query.preview === 'true') params.set('preview', 'true')
        if (previewToken.value) params.set('token', previewToken.value)
        if (locationSlug.value) params.set('location', locationSlug.value)
        if (locale.value) params.set('locale', locale.value)
        const query = params.toString()
        return query ? `${url}?${query}` : url
      }, {
        key: computed(() => `content-${siteId}-${page.value}-${locationSlug.value || 'site'}-${locale.value || 'source'}-${isPreview.value ? 'preview' : 'published'}-${previewToken.value}-${reloadToken.value}`),
        server: true,
        immediate: true
      })

  const { data, refresh } = contentFetch
  const previewOverrides = ref<Record<string, string>>({})

  const trustedOrigins = computed(() => {
    if (!process.client) return []

    const origins = new Set<string>([window.location.origin])
    const runtimeConfig = useRuntimeConfig()
    const candidates = [runtimeConfig.public?.siteUrl, runtimeConfig.public?.appUrl, runtimeConfig.public?.adminUrl]

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate) continue
      try {
        origins.add(new URL(candidate).origin)
      } catch {
        // Ignore invalid configured URLs.
      }
    }

    return Array.from(origins)
  })

  const isTrustedOrigin = (origin: string) => {
    if (!process.client) return false

    return trustedOrigins.value.some((trusted) => {
      try {
        const incoming = new URL(origin)
        const allowed = new URL(trusted)
        return incoming.protocol === allowed.protocol
          && (incoming.host === allowed.host || incoming.hostname.endsWith(`.${allowed.hostname}`))
      } catch {
        return false
      }
    })
  }

  const needsSanitization = (field: string) => {
    const def = getFieldDef(page.value, field)
    return def?.type === 'richtext'
  }

  const handlePreviewUpdate = async (event: MessageEvent) => {
    if (!isTrustedOrigin(event.origin)) return
    if (!isPreview.value) return
    const message = event.data
    if (message?.type !== 'admin:content-update') return
    if (message.page !== page.value) return
    if (typeof message.field !== 'string' || typeof message.value !== 'string') return

    let value = message.value
    if (needsSanitization(message.field) && process.client) {
      const DOMPurify = (await import('dompurify')).default
      value = DOMPurify.sanitize(message.value)
    }

    previewOverrides.value = {
      ...previewOverrides.value,
      [message.field]: value
    }
  }

  onMounted(() => {
    window.addEventListener('message', handlePreviewUpdate)
  })

  onUnmounted(() => {
    window.removeEventListener('message', handlePreviewUpdate)
  })

  /** Map of field → ContentRow for quick lookup */
  const contentMap = computed<Record<string, ContentRow>>(() => {
    const rows: ContentRow[] = (data.value as ApiValue)?.content || []
    return rows.reduce((acc, row) => {
      acc[row.field] = row
      return acc
    }, {} as Record<string, ContentRow>)
  })

  const hasDrafts = computed(() => (data.value as ApiValue)?.hasDrafts === true)

  /**
   * Get a field value from the DB.
   * Returns the DB value if it exists, otherwise the provided defaultValue.
   * Returns null when both are absent — callers can use this to show placeholder UI.
   */
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
    if (val && val.trim() !== '') return val
    return defaultValue
  }

  /**
   * Like getField but always returns a string — falls back to empty string.
   * Use this where a null would break a binding (e.g. href, src).
   */
  const getFieldStr = (field: string, defaultValue = ''): string =>
    getField(field, defaultValue) ?? defaultValue

  /**
   * Returns a { title, subtitle, video } object for hero sections.
   */
  const getHero = (defaults = { title: '', subtitle: '', image: '', video: '' }) => {
    const row = contentMap.value['hero']
    return {
      title: getField('hero.title', row?.hero_title ?? defaults.title) ?? defaults.title,
      subtitle: getField('hero.subtitle', row?.hero_subtitle ?? defaults.subtitle) ?? defaults.subtitle,
      image: getField('hero.image', row?.hero_public_url ?? defaults.image) ?? defaults.image,
      video: getField('hero.video', row?.hero_video_public_url ?? defaults.video) ?? defaults.video,
      imageKind: row?.hero_kind || 'image',
      videoKind: row?.hero_video_kind || 'video',
    }
  }

  /** Return the registry FieldDefinition for a field (type, source, label, etc.) */
  const getFieldDef_ = (field: string): FieldDefinition | undefined =>
    getFieldDef(page.value, field)

  
return {
    page,
    contentMap,
    hasDrafts,
    getField,
    getFieldStr,
    getHero,
    getFieldDef: getFieldDef_,
    refresh
  }
}

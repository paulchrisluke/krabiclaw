import { computed, onMounted } from 'vue'
import { useRoute, useFetch } from '#app'
import { getFieldDef } from '~/config/content-registry'
import type { FieldDefinition } from '~/config/content-registry'

interface ContentRow {
  page: string
  field: string
  content: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_video_url: string | null
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
  const isPreview = computed(() => route.query.preview === 'true')

  const { data, refresh } = useFetch(() => {
    if (isPlatform || !siteId) {
      throw new Error('Site context is required to load page content')
    }
    const url = `/api/public/sites/${siteId}/content/${page.value}`
    if (route.query.preview === 'true') {
      return `${url}?preview=true`
    }
    return url
  }, {
    key: computed(() => `content-${siteId}-${page.value}-${isPreview.value ? 'preview' : 'published'}`),
    server: true,
    immediate: !isPlatform && !!siteId
  })

  /** Map of field → ContentRow for quick lookup */
  const contentMap = computed<Record<string, ContentRow>>(() => {
    const rows: ContentRow[] = (data.value as any)?.content || []
    return rows.reduce((acc, row) => {
      acc[row.field] = row
      return acc
    }, {} as Record<string, ContentRow>)
  })

  const hasDrafts = computed(() => (data.value as any)?.hasDrafts === true)

  /**
   * Get a field value from the DB.
   * Returns the DB value if it exists, otherwise the provided defaultValue.
   * Returns null when both are absent — callers can use this to show placeholder UI.
   */
  const getField = (field: string, defaultValue: string | null = null): string | null => {
    if (field === 'hero.title' || field === 'hero.subtitle' || field === 'hero.video') {
      const heroRow = contentMap.value['hero']
      const fieldRow = contentMap.value[field]
      if (field === 'hero.title') return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue
      if (field === 'hero.subtitle') return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue
      if (field === 'hero.video') return heroRow?.hero_video_url ?? fieldRow?.content ?? defaultValue
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
  const getHero = (defaults = { title: '', subtitle: '', video: '' }) => {
    const row = contentMap.value['hero']
    return {
      title: getField('hero.title', row?.hero_title ?? defaults.title) ?? defaults.title,
      subtitle: getField('hero.subtitle', row?.hero_subtitle ?? defaults.subtitle) ?? defaults.subtitle,
      video: getField('hero.video', row?.hero_video_url ?? defaults.video) ?? defaults.video
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

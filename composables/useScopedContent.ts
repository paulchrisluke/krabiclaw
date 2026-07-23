import { ref, computed, watch } from 'vue'
import { useEditorContext } from './useEditorContext'

export interface SiteContent {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  page: string
  field: string
  content: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_video_url: string | null
  created_at: string
  updated_at: string
}

export const useScopedContent = (siteId: string, page: string, locationId?: string | null) => {
  const { currentLocationId } = useEditorContext(siteId)
  const content = ref<SiteContent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Use provided locationId or fall back to current scope
  const effectiveLocationId = computed(() => {
    if (locationId !== undefined) return locationId
    return currentLocationId.value
  })

  // Load content for current scope
  const loadContent = async () => {
    if (!siteId || !page) {
      error.value = 'Site ID and page are required'
      return
    }

    loading.value = true
    error.value = null

    try {
      const queryParams = new URLSearchParams()
      if (effectiveLocationId.value) {
        queryParams.set('locationId', effectiveLocationId.value)
      }

      const response = await $fetch<{
        success: boolean
        content: SiteContent[]
        siteId: string
        locationId: string | null
        page: string
      }>(`/api/editor/sites/${siteId}/content/${page}?${queryParams.toString()}`)

      if (response.success) {
        content.value = response.content
      } else {
        error.value = 'Failed to load content'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // Get content value by field
  const getField = (field: string): string | null => {
    const item = content.value.find(c => c.field === field)
    return item?.content || null
  }

  // Get hero field values
  const getHeroFields = () => {
    const heroItem = content.value.find(c => c.field === 'hero')
    return {
      title: heroItem?.hero_title || null,
      subtitle: heroItem?.hero_subtitle || null,
      videoUrl: heroItem?.hero_video_url || null
    }
  }

  // Auto-reload when scope changes
  watch(effectiveLocationId, () => {
    loadContent()
  }, { immediate: true })

  // Auto-reload when page changes
  watch(() => page, () => {
    loadContent()
  })

  return {
    content,
    loading,
    error,
    effectiveLocationId,
    getField,
    getHeroFields,
    loadContent
  }
}

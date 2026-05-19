import { ref, computed } from 'vue'
import type { MenuWithItems } from '~/server/types/menu'

export const usePublicMenu = (siteId: string, locationId?: string | null) => {
  const { locale } = useI18n()
  const menu = ref<MenuWithItems | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Load menu for public display
  const loadMenu = async () => {
    loading.value = true
    error.value = null

    try {
      const queryParams = new URLSearchParams()
      if (locationId) {
        queryParams.set('locationId', locationId)
      }
      if (locale.value) {
        queryParams.set('locale', locale.value)
      }

      const response = await $fetch<{
        success: boolean
        menu: MenuWithItems | null
        message?: string
      }>(`/api/public/sites/${siteId}/menus?${queryParams.toString()}`)

      if (response.success) {
        menu.value = response.menu
      } else {
        error.value = 'Failed to load menu'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // Get menu items grouped by section
  const menuItemsBySection = computed(() => {
    if (!menu.value) return {}
    
    const grouped: Record<string, typeof menu.value.items> = {}
    menu.value.items.forEach(item => {
      const section = item.section || 'Uncategorized'
      if (!grouped[section]) {
        grouped[section] = []
      }
      grouped[section].push(item)
    })
    
    return grouped
  })

  // Check if menu is available
  const hasMenu = computed(() => !!menu.value && menu.value.items.length > 0)

  // Auto-load when parameters change
  watch(() => [siteId, locationId, locale.value], () => {
    if (siteId) {
      loadMenu()
    }
  }, { immediate: true })

  return {
    menu,
    loading,
    error,
    hasMenu,
    menuItemsBySection,
    loadMenu
  }
}

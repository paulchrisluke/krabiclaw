import { ref, computed, watch } from 'vue'
import { useEditorContext } from './useEditorContext'
import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '~/server/types/menu'

export const useMenuEditor = (siteId: string, locationId?: string | null) => {
  const { currentLocationId, isBrandScope } = useEditorContext(siteId)
  
  // State
  const menus = ref<Menu[]>([])
  const currentMenu = ref<MenuWithItems | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  // Computed
  const hasMenus = computed(() => menus.value.length > 0)
  const hasCurrentMenu = computed(() => !!currentMenu.value)
  // When locationId is explicitly provided (including null or empty string), it's treated differently from undefined context default
  const effectiveLocationId = computed(() => locationId !== undefined ? locationId : currentLocationId.value)
  const isEditingBrandMenu = computed(() => locationId !== undefined ? (locationId === null || locationId === '') : isBrandScope.value)

  // Load menus for current scope
  let loadMenusRequestId = 0
  const loadMenus = async () => {
    const requestId = ++loadMenusRequestId
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      if (effectiveLocationId.value) params.set('locationId', effectiveLocationId.value)
      const response = await $fetch<{
        success: boolean
        menus: Menu[]
      }>(`/api/editor/sites/${siteId}/menus${params.toString() ? `?${params.toString()}` : ''}`)

      // Ignore stale responses
      if (requestId !== loadMenusRequestId) return

      if (response.success) {
        menus.value = response.menus
        currentMenu.value = null

        // Auto-select first menu if none selected
        if (response.menus.length > 0 && !currentMenu.value) {
          await loadMenu(response.menus[0]!.id)
        }
      } else {
        error.value = 'Failed to load menus'
      }
    } catch (err) {
      // Ignore stale errors
      if (requestId !== loadMenusRequestId) return
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      if (requestId === loadMenusRequestId) {
        loading.value = false
      }
    }
  }

  // Load specific menu with items
  const loadMenu = async (menuId: string) => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        menu: MenuWithItems
      }>(`/api/editor/sites/${siteId}/menus/${menuId}`)

      if (response.success) {
        currentMenu.value = response.menu
      } else {
        error.value = 'Failed to load menu'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // Create new menu
  const createMenu = async (menuData: CreateMenuRequest) => {
    saving.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        menu: Menu
      }>(`/api/editor/sites/${siteId}/menus`, {
        method: 'POST',
        body: {
          ...menuData,
          locationId: effectiveLocationId.value
        }
      })

      if (response.success) {
        menus.value.push(response.menu)
        await loadMenu(response.menu.id)
        return response.menu
      } else {
        throw new Error('Failed to create menu')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Update menu
  const updateMenu = async (menuId: string, updates: UpdateMenuRequest) => {
    saving.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        menu: Menu
      }>(`/api/editor/sites/${siteId}/menus/${menuId}`, {
        method: 'PATCH',
        body: updates
      })

      if (response.success) {
        // Update in menus list
        const index = menus.value.findIndex(m => m.id === menuId)
        if (index !== -1) {
          menus.value[index] = response.menu
        }
        
        // Update current menu if it's the one being edited
        if (currentMenu.value?.id === menuId) {
          currentMenu.value = { ...response.menu, items: currentMenu.value.items }
        }
        
        return response.menu
      } else {
        throw new Error('Failed to update menu')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Delete menu
  const deleteMenu = async (menuId: string) => {
    saving.value = true
    error.value = null

    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${menuId}`, {
        method: 'DELETE'
      })

      // Remove from menus list
      menus.value = menus.value.filter(m => m.id !== menuId)
      
      // Clear current menu if it was deleted
      if (currentMenu.value?.id === menuId) {
        currentMenu.value = null
      }
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Create menu item
  const createMenuItem = async (itemData: CreateMenuItemRequest) => {
    if (!currentMenu.value) throw new Error('No menu selected')

    saving.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        menuItem: MenuItem
      }>(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items`, {
        method: 'POST',
        body: itemData
      })

      if (response.success) {
        currentMenu.value.items.push(response.menuItem)
        return response.menuItem
      } else {
        throw new Error('Failed to create menu item')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Update menu item
  const updateMenuItem = async (itemId: string, updates: UpdateMenuItemRequest) => {
    if (!currentMenu.value) throw new Error('No menu selected')

    saving.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        menuItem: MenuItem
      }>(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`, {
        method: 'PATCH',
        body: updates
      })

      if (response.success) {
        // Update in current menu items
        const index = currentMenu.value.items.findIndex(item => item.id === itemId)
        if (index !== -1) {
          currentMenu.value.items[index] = response.menuItem
        }
        
        return response.menuItem
      } else {
        throw new Error('Failed to update menu item')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Delete menu item
  const deleteMenuItem = async (itemId: string) => {
    if (!currentMenu.value) throw new Error('No menu selected')

    saving.value = true
    error.value = null

    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`, {
        method: 'DELETE'
      })

      // Remove from current menu items
      currentMenu.value.items = currentMenu.value.items.filter(item => item.id !== itemId)
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Reorder menu items
  const reorderMenuItems = async (items: Array<{ id: string; sort_order: number }>) => {
    if (!currentMenu.value) throw new Error('No menu selected')

    saving.value = true
    error.value = null

    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/reorder`, {
        method: 'POST',
        body: { items }
      })

      // Update sort orders in current menu
      items.forEach(({ id, sort_order }) => {
        const item = currentMenu.value?.items.find(item => item.id === id)
        if (item) {
          item.sort_order = sort_order
        }
      })
      
      // Sort items by sort_order
      if (currentMenu.value) {
        currentMenu.value.items.sort((a, b) => a.sort_order - b.sort_order)
      }
      
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  // Get menu items grouped by section
  const menuItemsBySection = computed(() => {
    if (!currentMenu.value) return {}
    
    const grouped: Record<string, MenuItem[]> = {}
    currentMenu.value.items.forEach(item => {
      const section = item.section || 'Uncategorized'
      if (!grouped[section]) {
        grouped[section] = []
      }
      grouped[section].push(item)
    })
    
    return grouped
  })

  // Auto-load when scope changes
  watch(effectiveLocationId, () => {
    loadMenus()
  }, { immediate: true })

  // Reload when ChowBot makes menu changes
  const menuRefreshSignal = useState<number>('menu:refresh', () => 0)
  watch([menuRefreshSignal, effectiveLocationId], () => loadMenus())

  return {
    // State
    menus,
    currentMenu,
    loading,
    error,
    saving,
    
    // Computed
    hasMenus,
    hasCurrentMenu,
    isEditingBrandMenu,
    menuItemsBySection,
    
    // Actions
    loadMenus,
    loadMenu,
    createMenu,
    updateMenu,
    deleteMenu,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    reorderMenuItems
  }
}

import { ref, computed, watch } from 'vue'
import { useEditorContext } from './useEditorContext'
import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '~/server/types/menu'

export const useMenuEditor = (siteId: string, locationId?: string | null) => {
  const { currentLocationId, isBrandScope } = useEditorContext(siteId)

  const currentMenu = ref<MenuWithItems | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  const hasMenus = computed(() => !!currentMenu.value)
  const effectiveLocationId = computed(() => locationId !== undefined ? locationId : currentLocationId.value)
  const isEditingBrandMenu = computed(() => locationId !== undefined ? (locationId === null || locationId === '') : isBrandScope.value)

  // Race-condition guard: ignore responses from superseded requests
  let loadMenusRequestId = 0

  const loadMenus = async () => {
    const requestId = ++loadMenusRequestId
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      if (effectiveLocationId.value !== undefined && effectiveLocationId.value !== null && effectiveLocationId.value !== '') {
        params.set('locationId', effectiveLocationId.value)
      }
      const response = await $fetch<{ success: boolean; menus: Menu[] }>(
        `/api/editor/sites/${siteId}/menus${params.toString() ? `?${params.toString()}` : ''}`
      )

      if (requestId !== loadMenusRequestId) return

      if (response.success) {
        currentMenu.value = null
        if (response.menus.length > 0) {
          await loadMenu(response.menus[0]!.id)
        }
      } else {
        error.value = 'Failed to load menu'
      }
    } catch (err) {
      if (requestId !== loadMenusRequestId) return
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      if (requestId === loadMenusRequestId) loading.value = false
    }
  }

  const loadMenu = async (menuId: string) => {
    loading.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; menu: MenuWithItems }>(
        `/api/editor/sites/${siteId}/menus/${menuId}`
      )
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

  const createMenu = async (menuData: CreateMenuRequest) => {
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; menu: Menu }>(
        `/api/editor/sites/${siteId}/menus`,
        { method: 'POST', body: { ...menuData, locationId: effectiveLocationId.value } }
      )
      if (response.success) {
        await loadMenu(response.menu.id)
        return response.menu
      }
      throw new Error('Failed to create menu')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const updateMenu = async (menuId: string, updates: UpdateMenuRequest) => {
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; menu: Menu }>(
        `/api/editor/sites/${siteId}/menus/${menuId}`,
        { method: 'PATCH', body: updates }
      )
      if (response.success) {
        if (currentMenu.value?.id === menuId) {
          currentMenu.value = { ...response.menu, items: currentMenu.value.items }
        }
        return response.menu
      }
      throw new Error('Failed to update menu')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const deleteMenu = async (menuId: string) => {
    saving.value = true
    error.value = null
    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${menuId}`, { method: 'DELETE' })
      currentMenu.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const createMenuItem = async (itemData: CreateMenuItemRequest) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; menuItem: MenuItem }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items`,
        { method: 'POST', body: itemData }
      )
      if (response.success) {
        currentMenu.value.items.push(response.menuItem)
        return response.menuItem
      }
      throw new Error('Failed to create menu item')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const updateMenuItem = async (itemId: string, updates: UpdateMenuItemRequest) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; menuItem: MenuItem }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`,
        { method: 'PATCH', body: updates }
      )
      if (response.success) {
        const index = currentMenu.value.items.findIndex(item => item.id === itemId)
        if (index !== -1) currentMenu.value.items[index] = response.menuItem
        return response.menuItem
      }
      throw new Error('Failed to update menu item')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const deleteMenuItem = async (itemId: string) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`, { method: 'DELETE' })
      currentMenu.value.items = currentMenu.value.items.filter(item => item.id !== itemId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const renameMenuSection = async (oldSection: string, newSection: string) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; old_section: string; new_section: string; updated: number }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/sections`,
        { method: 'PATCH', body: { old_section: oldSection, new_section: newSection } }
      )
      if (response.success) {
        currentMenu.value.items = currentMenu.value.items.map(item =>
          item.section === oldSection ? { ...item, section: response.new_section } : item
        )
        return response
      }
      throw new Error('Failed to rename menu section')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const deleteMenuSection = async (section: string) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      const response = await $fetch<{ success: boolean; section: string; deleted: number }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/sections`,
        { method: 'DELETE', body: { section } }
      )
      if (response.success) {
        currentMenu.value.items = currentMenu.value.items.filter(item => item.section !== response.section)
        return response
      }
      throw new Error('Failed to delete menu section')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      saving.value = false
    }
  }

  const reorderMenuItems = async (items: Array<{ id: string; sort_order: number }>) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    saving.value = true
    error.value = null
    try {
      await $fetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/reorder`, {
        method: 'POST',
        body: { items }
      })
      items.forEach(({ id, sort_order }) => {
        const item = currentMenu.value?.items.find(i => i.id === id)
        if (item) item.sort_order = sort_order
      })
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

  const menuItemsBySection = computed(() => {
    if (!currentMenu.value) return {}
    const grouped: Record<string, MenuItem[]> = {}
    currentMenu.value.items.forEach(item => {
      const section = item.section || 'Uncategorized'
      if (!grouped[section]) grouped[section] = []
      grouped[section].push(item)
    })
    return grouped
  })

  // Reload on location change (immediate) or ChowBot menu changes
  const menuRefreshSignal = useState<number>('menu:refresh', () => 0)
  watch([effectiveLocationId, menuRefreshSignal], () => loadMenus(), { immediate: true })

  return {
    currentMenu,
    loading,
    error,
    saving,
    hasMenus,
    isEditingBrandMenu,
    menuItemsBySection,
    loadMenus,
    loadMenu,
    createMenu,
    updateMenu,
    deleteMenu,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    renameMenuSection,
    deleteMenuSection,
    reorderMenuItems,
  }
}

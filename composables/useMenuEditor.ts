import { ref, computed, watch } from 'vue'
import { useEditorContext } from './useEditorContext'
import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '~/server/types/menu'

const isMenu = (value: unknown): value is Menu =>
  isRecord(value) && typeof value.id === 'string' && typeof value.site_id === 'string'
const isMenuItem = (value: unknown): value is MenuItem =>
  isRecord(value) && typeof value.id === 'string' && typeof value.menu_id === 'string'
const isMenuWithItems = (value: unknown): value is MenuWithItems =>
  isRecord(value) && isMenu(value) && Array.isArray(value.items) && value.items.every(isMenuItem)
const isSuccess = (value: unknown): value is { success: true } =>
  isRecord(value) && value.success === true

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
      const response = await applicationFetch<{ success: boolean; menus: Menu[] }>(
        `/api/editor/sites/${siteId}/menus${params.toString() ? `?${params.toString()}` : ''}`,
        {
          validate: (value): value is { success: boolean; menus: Menu[] } =>
            isRecord(value) && value.success === true && Array.isArray(value.menus) && value.menus.every(isMenu),
        },
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
      const response = await applicationFetch<{ success: boolean; menu: MenuWithItems }>(
        `/api/editor/sites/${siteId}/menus/${menuId}`,
        {
          validate: (value): value is { success: boolean; menu: MenuWithItems } =>
            isRecord(value) && value.success === true && isMenuWithItems(value.menu),
        },
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
      const response = await applicationFetch<{ success: boolean; menu: Menu }>(
        `/api/editor/sites/${siteId}/menus`,
        {
          method: 'POST',
          body: { ...menuData, locationId: effectiveLocationId.value },
          validate: (value): value is { success: boolean; menu: Menu } =>
            isRecord(value) && value.success === true && isMenu(value.menu),
        },
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
      const response = await applicationFetch<{ success: boolean; menu: Menu }>(
        `/api/editor/sites/${siteId}/menus/${menuId}`,
        {
          method: 'PATCH',
          body: updates,
          validate: (value): value is { success: boolean; menu: Menu } =>
            isRecord(value) && value.success === true && isMenu(value.menu),
        },
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
      await applicationFetch(`/api/editor/sites/${siteId}/menus/${menuId}`, {
        method: 'DELETE',
        validate: isSuccess,
      })
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
      const response = await applicationFetch<{ success: boolean; menuItem: MenuItem }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items`,
        {
          method: 'POST',
          body: itemData,
          validate: (value): value is { success: boolean; menuItem: MenuItem } =>
            isRecord(value) && value.success === true && isMenuItem(value.menuItem),
        },
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
      const response = await applicationFetch<{ success: boolean; menuItem: MenuItem }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`,
        {
          method: 'PATCH',
          body: updates,
          validate: (value): value is { success: boolean; menuItem: MenuItem } =>
            isRecord(value) && value.success === true && isMenuItem(value.menuItem),
        },
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
      await applicationFetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/items/${itemId}`, {
        method: 'DELETE',
        validate: isSuccess,
      })
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
      const response = await applicationFetch<{ success: boolean; old_section: string; new_section: string; updated: number }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/sections`,
        {
          method: 'PATCH',
          body: { old_section: oldSection, new_section: newSection },
          validate: (value): value is { success: boolean; old_section: string; new_section: string; updated: number } =>
            isRecord(value)
            && value.success === true
            && typeof value.old_section === 'string'
            && typeof value.new_section === 'string'
            && typeof value.updated === 'number',
        },
      )
      if (response.success) {
        currentMenu.value.items = currentMenu.value.items.map(item =>
          item.section === oldSection ? { ...item, section: response.new_section } : item
        )
        currentMenu.value.section_order = (currentMenu.value.section_order ?? []).map(section =>
          section === oldSection ? response.new_section : section
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
      const encodedSection = encodeURIComponent(section)
      const response = await applicationFetch<{ success: boolean; section: string; deleted: number }>(
        `/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/sections?section=${encodedSection}`,
        {
          method: 'DELETE',
          validate: (value): value is { success: boolean; section: string; deleted: number } =>
            isRecord(value)
            && value.success === true
            && typeof value.section === 'string'
            && typeof value.deleted === 'number',
        },
      )
      if (response.success) {
        currentMenu.value.items = currentMenu.value.items.filter(item => item.section !== response.section)
        currentMenu.value.section_order = (currentMenu.value.section_order ?? []).filter(section => section !== response.section)
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
      await applicationFetch(`/api/editor/sites/${siteId}/menus/${currentMenu.value.id}/reorder`, {
        method: 'POST',
        body: { items },
        validate: isSuccess,
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
    for (const section of currentMenu.value.section_order ?? []) {
      if (!grouped[section]) grouped[section] = []
    }
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

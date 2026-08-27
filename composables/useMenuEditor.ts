import { ref, computed, watch } from 'vue'
import { useEditorContext } from './useEditorContext'
import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '~/server/types/menu'

const isMenu = (value: unknown): value is Menu =>
  isRecord(value) && typeof value.id === 'string' && typeof value.site_id === 'string'
const isMenuItem = (value: unknown): value is MenuItem =>
  isRecord(value) && typeof value.id === 'string' && typeof value.menu_id === 'string'
const isMenuWithItems = (value: unknown): value is MenuWithItems =>
  isRecord(value) && isMenu(value) && Array.isArray(value.items) && value.items.every(isMenuItem)
const isMenusWithDetailResponse = (value: unknown): value is { success: boolean; menus: Menu[]; menu: MenuWithItems | null } =>
  isRecord(value)
  && value.success === true
  && Array.isArray(value.menus)
  && value.menus.every(isMenu)
  && (value.menu === null || isMenuWithItems(value.menu))
const isSuccess = (value: unknown): value is { success: true } =>
  isRecord(value) && value.success === true

export const useMenuEditor = async (siteId: string, locationId?: string | null) => {
  const editorContext = locationId === undefined ? useEditorContext(siteId) : null

  const currentMenu = ref<MenuWithItems | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)

  const hasMenus = computed(() => !!currentMenu.value)
  const effectiveLocationId = computed(() => locationId !== undefined ? locationId : editorContext!.currentLocationId.value)
  const isEditingBrandMenu = computed(() => locationId !== undefined ? (locationId === null || locationId === '') : editorContext!.isBrandScope.value)

  // Reload on location change (immediate) or ChowBot menu changes
  const menuRefreshSignal = useState<number>('menu:refresh', () => 0)
  const requestEvent = useRequestEvent()

  // Location-scoped menus (the only mode this editor is actually used in —
  // see pages/dashboard/.../locations/[locationSlug]/menu/index.vue) load via
  // the direct SSR server service during SSR, matching every other converted
  // dashboard editor resource; brand-wide scope (locationId undefined, no
  // known consumer today) keeps the original client-only two-step fetch.
  const {
    data: menusResource,
    pending: menusPending,
    error: menusResourceError,
    refresh: refreshMenusResource,
  } = await useAsyncData(
    computed(() => `dashboard-menus:${siteId}:${effectiveLocationId.value ?? 'brand'}`),
    async () => {
      const currentEffectiveLocationId = effectiveLocationId.value
      if (currentEffectiveLocationId && import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const { loadDashboardLocationMenus } = await import('~/server/utils/dashboard-editor-resources')
        return await loadDashboardLocationMenus(requestEvent, siteId, currentEffectiveLocationId)
      }
      const params = new URLSearchParams()
      if (currentEffectiveLocationId !== undefined && currentEffectiveLocationId !== null && currentEffectiveLocationId !== '') {
        params.set('locationId', currentEffectiveLocationId)
      }
      const listResponse = await applicationFetch<{ success: boolean; menus: Menu[] }>(
        `/api/editor/sites/${siteId}/menus${params.toString() ? `?${params.toString()}` : ''}`,
        {
          validate: (value): value is { success: boolean; menus: Menu[] } =>
            isRecord(value) && value.success === true && Array.isArray(value.menus) && value.menus.every(isMenu),
        },
      )
      if (listResponse.menus.length === 0) return { success: true as const, menus: [], menu: null }
      const detailResponse = await applicationFetch<{ success: boolean; menu: MenuWithItems }>(
        `/api/editor/sites/${siteId}/menus/${listResponse.menus[0]!.id}`,
        {
          validate: (value): value is { success: boolean; menu: MenuWithItems } =>
            isRecord(value) && value.success === true && isMenuWithItems(value.menu),
        },
      )
      return { success: true as const, menus: listResponse.menus, menu: detailResponse.menu }
    },
    { lazy: import.meta.client, watch: [menuRefreshSignal] },
  )

  watch([menusResource, menusPending, menusResourceError], ([resource, pending, err]) => {
    loading.value = pending
    if (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return
    }
    if (resource && isMenusWithDetailResponse(resource)) {
      currentMenu.value = resource.menu
      error.value = null
    }
  }, { immediate: true })

  const loadMenus = async () => {
    await refreshMenusResource()
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

  // menu_item:gallery is an ordered collection with exactly one member in
  // this quick-editor (there is no multi-photo grid here), managed as a
  // single cover image via targeted attach/remove — never a full-array
  // PATCH — so a stale reload can never resurrect a photo someone else
  // removed elsewhere.
  const updateMenuItemCoverMedia = async (itemId: string, nextAssetId: string | null, previousAssetId: string | null) => {
    if (!currentMenu.value) throw new Error('No menu selected')
    if (nextAssetId === previousAssetId) return
    saving.value = true
    error.value = null
    try {
      const placement = { owner_type: 'menu_item', owner_id: itemId, slot: 'gallery' }
      const validate = (value: unknown): value is { asset_ids: string[]; media: MenuItem['media'] } =>
        isRecord(value) && Array.isArray(value.asset_ids)
      let result: { asset_ids: string[]; media: MenuItem['media'] } | null = null
      // Attach the new cover before removing the old one, so a failed attach
      // leaves the previous cover intact instead of leaving the item with none.
      if (nextAssetId) {
        result = await applicationFetch(`/api/editor/sites/${siteId}/media/placements/attach`, {
          method: 'POST',
          body: { placement, asset_id: nextAssetId },
          validate,
        })
      }
      if (previousAssetId) {
        result = await applicationFetch(`/api/editor/sites/${siteId}/media/placements/remove`, {
          method: 'POST',
          body: { placement, asset_id: previousAssetId },
          validate,
        })
      }
      const index = currentMenu.value.items.findIndex(item => item.id === itemId)
      const target = index !== -1 ? currentMenu.value.items[index] : undefined
      if (target && result) target.media = result.media
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
    updateMenuItemCoverMedia,
    deleteMenuItem,
    renameMenuSection,
    deleteMenuSection,
    reorderMenuItems,
  }
}

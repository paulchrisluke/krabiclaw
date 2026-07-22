<template>
  <div class="space-y-4">
    <template v-if="loading">
      <UCard :ui="{ body: 'p-0' }">
        <div v-for="i in 5" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3.5 last:border-0">
          <USkeleton class="size-14 rounded-md" />
          <USkeleton class="h-4 w-40" />
          <USkeleton class="ml-auto h-4 w-16" />
          <USkeleton class="h-5 w-20 rounded-full" />
        </div>
      </UCard>
    </template>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="error"
    />

    <UCard v-else-if="!hasMenus">
      <div class="py-10 text-center">
        <UIcon name="i-lucide-list" class="mx-auto size-10 text-muted" />
        <h2 class="mt-4 text-base font-semibold text-highlighted">No menus yet</h2>
        <p class="mt-1 text-sm text-muted">Create a menu to start adding sections and items.</p>
        <template v-if="!showCreateMenuForm">
          <UButton class="mt-5" icon="i-lucide-plus" @click="showCreateMenuForm = true">Create menu</UButton>
        </template>
        <div v-else class="mx-auto mt-5 max-w-sm space-y-3 text-left">
          <UFormField label="Menu name">
            <UInput v-model="createMenuForm.name" placeholder="Dinner Menu" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createMenuForm.description" :rows="2" placeholder="Our evening selection..." />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="showCreateMenuForm = false">Cancel</UButton>
            <UButton size="sm" :loading="saving" :disabled="!createMenuForm.name.trim()" @click="handleCreateMenu">Create menu</UButton>
          </div>
        </div>
      </div>
    </UCard>

    <template v-else>
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-highlighted">{{ currentMenu?.name }}</span>
        </div>
        <div class="flex items-center gap-2">
          <AiMenuImport :site-id="props.siteId" :menu-id="currentMenu?.id" @imported="handleAiImport" />
          <UButton
            v-if="currentMenu?.status === 'draft'"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-upload"
            :loading="saving"
            @click="handlePublish"
          >
            Publish
          </UButton>
          <UButton
            v-else
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-archive"
            :loading="saving"
            @click="handleUnpublish"
          >
            Unpublish
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            :disabled="saving"
            @click="confirmDeleteOpen = true"
          />
        </div>
      </div>

      <UCard v-if="featuredItems.length > 0" :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">Homepage featured dishes</h2>
              <p class="mt-1 text-xs text-muted">Shown first in the Saya homepage highlights.</p>
            </div>
            <UBadge color="neutral" variant="soft" size="xs">{{ featuredItems.length }}</UBadge>
          </div>
        </template>

        <div
          v-for="(item, index) in featuredItems"
          :key="item.id"
          class="grid gap-3 border-b border-default px-4 py-3 last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
        >
          <div class="flex size-8 items-center justify-center rounded-md bg-elevated text-xs font-semibold tabular-nums text-muted">
            {{ index + 1 }}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ item.name }}</p>
            <p class="truncate text-xs text-muted">{{ item.section }}</p>
          </div>
          <div class="flex justify-end gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up"
              aria-label="Move featured item up"
              :disabled="saving || index === 0"
              @click="moveFeaturedItem(item, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-down"
              aria-label="Move featured item down"
              :disabled="saving || index === featuredItems.length - 1"
              @click="moveFeaturedItem(item, 1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="Remove from featured"
              :disabled="saving"
              @click="handleFeaturedToggle(item, false)"
            />
          </div>
        </div>
      </UCard>

      <UModal v-model:open="confirmDeleteOpen" :ui="{ content: 'max-w-sm' }">
        <template #content>
          <div class="p-6">
            <h3 class="mb-1 text-base font-semibold text-default">Delete menu?</h3>
            <p class="mb-6 text-sm text-muted">
              This will permanently delete <strong>{{ currentMenu?.name }}</strong> and all its items. This cannot be undone.
            </p>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="confirmDeleteOpen = false">Cancel</UButton>
              <UButton color="error" :loading="saving" @click="handleDeleteMenu">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="confirmDeleteSectionOpen" :ui="{ content: 'max-w-sm' }">
        <template #content>
          <div class="p-6">
            <h3 class="mb-1 text-base font-semibold text-default">Delete section?</h3>
            <p class="mb-6 text-sm text-muted">
              This will permanently delete <strong>{{ sectionDeleteTarget }}</strong> and every item inside it.
            </p>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="confirmDeleteSectionOpen = false">Cancel</UButton>
              <UButton color="error" :loading="saving" @click="handleDeleteSection">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>

      <div class="overflow-hidden rounded-lg border border-default">
        <template v-for="section in allSections" :key="section">
          <div class="border-b border-default bg-elevated px-4 py-2.5">
            <div v-if="editingSection === section" class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <UInput v-model="sectionEditName" size="sm" class="sm:max-w-xs" autofocus />
              <div class="flex justify-end gap-2">
                <UButton size="sm" color="neutral" variant="ghost" @click="cancelRenameSection">Cancel</UButton>
                <UButton size="sm" :loading="saving" :disabled="!sectionEditName.trim()" @click="handleRenameSection(section)">
                  Save
                </UButton>
              </div>
            </div>
            <div v-else class="flex items-center justify-between gap-4">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted">{{ section }}</span>
              <div class="flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-arrow-up"
                  aria-label="Move section up"
                  :disabled="saving || allSections.indexOf(section) === 0"
                  @click="moveSection(section, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-arrow-down"
                  aria-label="Move section down"
                  :disabled="saving || allSections.indexOf(section) === allSections.length - 1"
                  @click="moveSection(section, 1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-square-pen"
                  aria-label="Rename section"
                  @click="openRenameSection(section)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  aria-label="Delete section"
                  @click="openDeleteSection(section)"
                />
                <UButton size="sm" color="primary" variant="soft" icon="i-lucide-plus" :to="itemCreatePath(section)">
                  Add item
                </UButton>
              </div>
            </div>
          </div>

          <div
            v-for="item in menuItemsBySection[section]"
            :key="item.id"
            class="grid gap-3 border-b border-default px-4 py-3 last:border-0 hover:bg-elevated sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] sm:items-center"
          >
            <MediaPicker
              :model-value="item.image_asset_id"
              :site-id="props.siteId"
              :location-id="props.locationId"
              accept="any"
              title="Item image or video"
              @update:model-value="handleQuickUpdateItem(item, { image_asset_id: $event })"
            >
              <div class="group relative size-14 overflow-hidden rounded-md border border-default bg-muted">
                <img
                  v-if="item.public_url && item.kind !== 'video'"
                  :src="item.public_url"
                  :alt="item.name"
                  class="size-full object-cover"
                />
                <div v-else class="flex size-full items-center justify-center">
                  <UIcon :name="item.kind === 'video' ? 'i-lucide-film' : 'i-lucide-image'" class="size-5 text-muted" />
                </div>
                <div class="absolute inset-0 flex items-center justify-center bg-default/70 opacity-0 transition-opacity group-hover:opacity-100">
                  <UIcon name="i-lucide-image" class="size-4 text-highlighted" />
                </div>
              </div>
            </MediaPicker>

            <NuxtLink :to="itemEditPath(item)" class="min-w-0">
              <span class="block truncate text-sm font-medium text-highlighted">{{ item.name }}</span>
              <span class="block truncate text-sm text-muted">{{ item.description || 'No description' }}</span>
            </NuxtLink>

            <UInput
              :model-value="item.price_amount === null || item.price_amount === undefined ? '' : String(item.price_amount)"
              size="sm"
              :placeholder="pricePlaceholder"
              class="sm:w-28"
              @change="handlePriceChange(item, $event)"
            />

            <UCheckbox
              :model-value="item.available"
              label="Available"
              @update:model-value="handleQuickUpdateItem(item, { available: Boolean($event) })"
            />

            <UCheckbox
              :model-value="item.featured"
              label="Featured"
              @update:model-value="handleFeaturedToggle(item, Boolean($event))"
            />

            <div class="flex justify-end">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-square-pen" :to="itemEditPath(item)">
                Details
              </UButton>
            </div>
          </div>

          <div
            v-if="!menuItemsBySection[section]?.length"
            class="flex items-center justify-between gap-3 border-b border-default px-4 py-3 text-sm text-muted last:border-0"
          >
            <span>No items yet.</span>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" :to="itemCreatePath(section)">
              Add item
            </UButton>
          </div>
        </template>

        <div v-if="!showAddSectionForm" class="flex justify-center px-4 py-3">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="showAddSectionForm = true">
            Add section
          </UButton>
        </div>
        <div v-else class="bg-elevated px-4 py-4">
          <div class="space-y-3">
            <UFormField label="Section name">
              <UInput v-model="newSectionName" placeholder="Starters, Mains, Desserts..." autofocus />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" size="sm" @click="cancelAddSection">Cancel</UButton>
              <UButton size="sm" :disabled="!newSectionName.trim()" @click="handleAddSection">Create section</UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useMenuEditor } from '~/composables/useMenuEditor'
import type { MenuItem, UpdateMenuItemRequest } from '~/server/types/menu'

const props = defineProps<{
  siteId: string
  locationId?: string | null
  defaultCurrency?: string
}>()

const toast = useToast()

const {
  currentMenu,
  loading,
  error,
  saving,
  hasMenus,
  menuItemsBySection,
  loadMenu,
  createMenu,
  deleteMenu,
  updateMenuItem,
  renameMenuSection,
  deleteMenuSection,
  updateMenu
} = useMenuEditor(props.siteId, props.locationId)

const handlePublish = async () => {
  if (!currentMenu.value) return
  try {
    await updateMenu(currentMenu.value.id, { status: 'published' })
    toast.add({ description: 'Menu published', color: 'success' })
  } catch (err) {
    console.error('handlePublish failed:', err)
    toast.add({ description: 'Failed to publish menu', color: 'error' })
  }
}

const handleUnpublish = async () => {
  if (!currentMenu.value) return
  try {
    await updateMenu(currentMenu.value.id, { status: 'draft' })
    toast.add({ description: 'Menu unpublished', color: 'success' })
  } catch (err) {
    console.error('handleUnpublish failed:', err)
    toast.add({ description: 'Failed to unpublish menu', color: 'error' })
  }
}

const pricePlaceholder = computed(() => '250')

const handleAiImport = async (menuId: string) => {
  await loadMenu(menuId)
  editingSection.value = null
  pendingSections.value = []
  newSectionName.value = ''
  showAddSectionForm.value = false
}

const confirmDeleteOpen = ref(false)
const confirmDeleteSectionOpen = ref(false)
const sectionDeleteTarget = ref<string | null>(null)

const handleDeleteMenu = async () => {
  if (!currentMenu.value) return
  try {
    await deleteMenu(currentMenu.value.id)
    confirmDeleteOpen.value = false
    editingSection.value = null
    pendingSections.value = []
    newSectionName.value = ''
    showAddSectionForm.value = false
    toast.add({ description: 'Menu deleted', color: 'success' })
  } catch (err) {
    console.error('handleDeleteMenu failed:', err)
    toast.add({ description: 'Failed to delete menu', color: 'error' })
  }
}

const showCreateMenuForm = ref(false)
const createMenuForm = reactive({ name: '', description: '' })

const handleCreateMenu = async () => {
  if (!createMenuForm.name.trim()) return
  try {
    await createMenu({ name: createMenuForm.name.trim(), description: createMenuForm.description || undefined })
    createMenuForm.name = ''
    createMenuForm.description = ''
    showCreateMenuForm.value = false
  } catch (err) {
    console.error('handleCreateMenu failed:', err)
    toast.add({ description: 'Failed to create menu', color: 'error' })
  }
}

const menuRouteQuery = computed(() => ({
  menuId: currentMenu.value?.id
}))

const { paths } = useDashboardSiteLinks(props.siteId)

const itemCreatePath = (section: string) => ({
  path: `${paths.value.menu}/items/new`,
  query: {
    ...menuRouteQuery.value,
    section
  }
})

const itemEditPath = (item: MenuItem) => ({
  path: `${paths.value.menu}/items/${item.id}`,
  query: menuRouteQuery.value
})

const handleQuickUpdateItem = async (item: MenuItem, updates: UpdateMenuItemRequest) => {
  try {
    await updateMenuItem(item.id, updates)
    if (currentMenu.value) await loadMenu(currentMenu.value.id)
  } catch (err) {
    console.error('handleQuickUpdateItem failed:', err)
    toast.add({ description: 'Failed to update item', color: 'error' })
  }
}

const handlePriceChange = (item: MenuItem, event: Event) => {
  const target = event.target as HTMLInputElement | null
  const trimmed = target?.value.trim() ?? ''
  const value = trimmed || null
  if ((item.price_amount ?? null) === value) return
  handleQuickUpdateItem(item, { price_amount: value })
}

const featuredItems = computed(() => {
  const items = currentMenu.value?.items ?? []
  return items
    .filter((item: MenuItem) => item.featured)
    .sort((a: MenuItem, b: MenuItem) => {
      if ((a.featured_sort_order ?? 0) !== (b.featured_sort_order ?? 0)) {
        return (a.featured_sort_order ?? 0) - (b.featured_sort_order ?? 0)
      }
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      return a.name.localeCompare(b.name)
    })
})

const handleFeaturedToggle = async (item: MenuItem, featured: boolean) => {
  const maxFeaturedOrder = featuredItems.value.reduce(
    (max: number, featuredItem: MenuItem) => Math.max(max, featuredItem.featured_sort_order ?? 0),
    -1
  )
  await handleQuickUpdateItem(item, {
    featured,
    featured_sort_order: featured ? (item.featured ? item.featured_sort_order : maxFeaturedOrder + 1) : 0
  })
}

const saveFeaturedOrder = async (items: MenuItem[]) => {
  await Promise.all(items.map((item: MenuItem, index: number) =>
    updateMenuItem(item.id, { featured_sort_order: index })
  ))
}

const moveFeaturedItem = async (item: MenuItem, direction: -1 | 1) => {
  const from = featuredItems.value.findIndex((featuredItem: MenuItem) => featuredItem.id === item.id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= featuredItems.value.length) return

  const prevOrder = featuredItems.value.map((featuredItem: MenuItem) => ({
    id: featuredItem.id,
    featured_sort_order: featuredItem.featured_sort_order
  }))

  const next = [...featuredItems.value]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)

  try {
    await saveFeaturedOrder(next)
    if (currentMenu.value) await loadMenu(currentMenu.value.id)
    toast.add({ description: 'Featured order updated', color: 'success' })
  } catch (err) {
    console.error('moveFeaturedItem failed:', err)
    try {
      await Promise.all(
        prevOrder.map((featuredItem: { id: string; featured_sort_order: number | null }) =>
          updateMenuItem(featuredItem.id, { featured_sort_order: featuredItem.featured_sort_order ?? 0 })
        )
      )
    } catch (rollbackErr) {
      console.error('moveFeaturedItem rollback failed:', rollbackErr)
    }
    if (currentMenu.value) await loadMenu(currentMenu.value.id)
    toast.add({ description: 'Failed to reorder featured dishes', color: 'error' })
  }
}

const openDeleteSection = (section: string) => {
  editingSection.value = null
  sectionDeleteTarget.value = section
  confirmDeleteSectionOpen.value = true
}

const handleDeleteSection = async () => {
  if (!sectionDeleteTarget.value) return
  const section = sectionDeleteTarget.value

  if (pendingSections.value.includes(section) && !menuItemsBySection.value[section]?.length) {
    try {
      await saveSectionOrder(allSections.value.filter((item: string) => item !== section))
      pendingSections.value = pendingSections.value.filter((pending: string) => pending !== section)
      sectionDeleteTarget.value = null
      confirmDeleteSectionOpen.value = false
      toast.add({ description: 'Section deleted', color: 'success' })
    } catch (err) {
      console.error('handleDeleteSection failed:', err)
      toast.add({ description: 'Failed to delete section', color: 'error' })
    }
    return
  }

  try {
    await deleteMenuSection(section)
    pendingSections.value = pendingSections.value.filter((pending: string) => pending !== section)
    sectionDeleteTarget.value = null
    confirmDeleteSectionOpen.value = false
    toast.add({ description: 'Section deleted', color: 'success' })
  } catch (err) {
    console.error('handleDeleteSection failed:', err)
    toast.add({ description: 'Failed to delete section', color: 'error' })
  }
}

const pendingSections = ref<string[]>([])
const showAddSectionForm = ref(false)
const newSectionName = ref('')
const editingSection = ref<string | null>(null)
const sectionEditName = ref('')

const allSections = computed(() => {
  const existing = Object.keys(menuItemsBySection.value)
  const ordered = currentMenu.value?.section_order?.filter((section: string) => existing.includes(section)) ?? []
  const unordered = existing
    .filter((section: string) => !ordered.includes(section))
    .sort((a: string, b: string) => a.localeCompare(b))
  const pending = pendingSections.value.filter((section: string) => !ordered.includes(section) && !unordered.includes(section))
  return [...ordered, ...unordered, ...pending]
})

const saveSectionOrder = async (sections: string[]) => {
  if (!currentMenu.value) return
  const normalized = sections
    .map((section: string) => section.trim())
    .filter((section: string, index: number, source: string[]) => section && source.indexOf(section) === index)
  await updateMenu(currentMenu.value.id, { section_order: normalized })
  pendingSections.value = pendingSections.value.filter((section: string) => normalized.includes(section))
}

const moveSection = async (section: string, direction: -1 | 1) => {
  const from = allSections.value.indexOf(section)
  const to = from + direction
  if (from < 0 || to < 0 || to >= allSections.value.length) return

  const next = [...allSections.value]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)

  try {
    await saveSectionOrder(next)
    toast.add({ description: 'Section order updated', color: 'success' })
  } catch (err) {
    console.error('moveSection failed:', err)
    toast.add({ description: 'Failed to reorder sections', color: 'error' })
  }
}

const handleAddSection = async () => {
  const name = newSectionName.value.trim()
  if (!name) return
  if (!allSections.value.includes(name)) {
    pendingSections.value.push(name)
    try {
      await saveSectionOrder([...allSections.value])
      toast.add({ description: 'Section created', color: 'success' })
    } catch (err) {
      console.error('handleAddSection failed:', err)
      pendingSections.value = pendingSections.value.filter((section: string) => section !== name)
      toast.add({ description: 'Failed to create section', color: 'error' })
      return
    }
  }
  newSectionName.value = ''
  showAddSectionForm.value = false
}

const cancelAddSection = () => {
  newSectionName.value = ''
  showAddSectionForm.value = false
}

const openRenameSection = (section: string) => {
  showAddSectionForm.value = false
  editingSection.value = section
  sectionEditName.value = section
}

const cancelRenameSection = () => {
  editingSection.value = null
  sectionEditName.value = ''
}

const handleRenameSection = async (section: string) => {
  const name = sectionEditName.value.trim()
  if (!name || name === section) {
    cancelRenameSection()
    return
  }
  if (pendingSections.value.includes(section) && !menuItemsBySection.value[section]?.length) {
    pendingSections.value = pendingSections.value.map((pending: string) => pending === section ? name : pending)
    try {
      await saveSectionOrder(allSections.value.map((item: string) => item === section ? name : item))
      editingSection.value = null
      sectionEditName.value = ''
    } catch (err) {
      console.error('handleRenameSection failed:', err)
      pendingSections.value = pendingSections.value.map((pending: string) => pending === name ? section : pending)
      toast.add({ description: 'Failed to rename section', color: 'error' })
    }
    return
  }
  try {
    await renameMenuSection(section, name)
    editingSection.value = null
    sectionEditName.value = ''
    toast.add({ description: 'Section renamed', color: 'success' })
  } catch (err) {
    console.error('handleRenameSection failed:', err)
    toast.add({ description: 'Failed to rename section', color: 'error' })
  }
}
</script>

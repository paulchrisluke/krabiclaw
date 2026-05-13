<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <template v-if="loading">
      <UCard :ui="{ body: 'p-0' }">
        <div v-for="i in 5" :key="i" class="flex items-center gap-4 border-b border-default px-4 py-3.5 last:border-0">
          <USkeleton class="h-4 w-40" />
          <USkeleton class="ml-auto h-4 w-16" />
          <USkeleton class="h-5 w-20 rounded-full" />
        </div>
      </UCard>
    </template>

    <!-- Error state -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="error"
    />

    <!-- No menus — empty state -->
    <UCard v-else-if="!hasMenus">
      <div class="py-10 text-center">
        <UIcon name="i-heroicons-list-bullet" class="mx-auto size-10 text-muted" />
        <h2 class="mt-4 text-base font-semibold text-highlighted">No menus yet</h2>
        <p class="mt-1 text-sm text-muted">Create a menu to start adding sections and items.</p>
        <template v-if="!showCreateMenuForm">
          <UButton class="mt-5" icon="i-heroicons-plus" @click="showCreateMenuForm = true">Create menu</UButton>
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

    <!-- Menu content -->
    <template v-else>
      <!-- Menu selector / toolbar -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <USelect
            v-if="menuOptions.length > 1"
            v-model="selectedMenuId"
            :items="menuOptions"
            size="sm"
            @update:model-value="handleMenuChange"
          />
          <div v-else class="flex items-center gap-2">
            <span class="text-sm font-medium text-highlighted">{{ currentMenu?.name }}</span>
            <UBadge :color="currentMenu?.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs">
              {{ currentMenu?.status }}
            </UBadge>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <AiMenuImport :site-id="props.siteId" :menu-id="currentMenu?.id" @imported="handleAiImport" />
          <UButton color="neutral" variant="ghost" size="sm" icon="i-heroicons-plus" @click="showCreateMenuForm = true">
            New menu
          </UButton>
        </div>
      </div>

      <!-- Inline create menu form -->
      <div v-if="showCreateMenuForm && hasMenus" class="rounded-lg border border-default bg-elevated p-4">
        <h3 class="mb-3 text-sm font-semibold text-highlighted">New menu</h3>
        <div class="space-y-3">
          <UFormField label="Menu name">
            <UInput v-model="createMenuForm.name" placeholder="Lunch Menu" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createMenuForm.description" :rows="2" placeholder="Optional description..." />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="showCreateMenuForm = false">Cancel</UButton>
            <UButton size="sm" :loading="saving" :disabled="!createMenuForm.name.trim()" @click="handleCreateMenu">Create menu</UButton>
          </div>
        </div>
      </div>

      <!-- Single bordered list: sections + items -->
      <div class="overflow-hidden rounded-lg border border-default">
        <template v-for="section in allSections" :key="section">
          <!-- Section header row -->
          <div class="flex items-center justify-between gap-4 border-b border-default bg-elevated px-4 py-2.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">{{ section }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-plus" @click="openAddItem(section)">
              Add item
            </UButton>
          </div>

          <!-- Items -->
          <template v-for="item in menuItemsBySection[section]" :key="item.id">
            <!-- Collapsed item row -->
            <div
              v-if="expandedItemId !== item.id"
              class="flex cursor-pointer items-center gap-4 border-b border-default px-4 py-3.5 last:border-0 hover:bg-elevated"
              @click="openEditItem(item)"
            >
              <div class="min-w-0 flex-1">
                <span class="text-sm font-medium text-highlighted">{{ item.name }}</span>
                <span v-if="item.description" class="ml-2 truncate text-sm text-muted">{{ item.description }}</span>
              </div>
              <span v-if="item.price" class="shrink-0 text-sm font-medium text-default">{{ item.price }}</span>
              <UBadge :color="item.available ? 'success' : 'neutral'" variant="soft" size="xs">
                {{ item.available ? 'Available' : 'Unavailable' }}
              </UBadge>
              <UIcon name="i-heroicons-pencil-square" class="size-4 shrink-0 text-muted" />
            </div>

            <!-- Expanded inline edit -->
            <div v-else class="border-b border-default bg-elevated px-4 py-4 last:border-0">
              <div class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Name">
                    <UInput v-model="editForm.name" placeholder="Item name" autofocus />
                  </UFormField>
                  <UFormField label="Price">
                    <UInput v-model="editForm.price" placeholder="฿250" />
                  </UFormField>
                </div>
                <UFormField label="Description">
                  <UTextarea v-model="editForm.description" :rows="2" placeholder="Short description..." />
                </UFormField>
                <UFormField label="Image">
                  <MediaPicker
                    v-model="editForm.image_asset_id"
                    :site-id="props.siteId"
                    accept="image"
                    title="Item image"
                  />
                </UFormField>
                <UCheckbox v-model="editForm.available" label="Available for ordering" />
                <div class="flex items-center justify-between gap-2">
                  <UButton color="neutral" variant="ghost" size="sm" icon="i-heroicons-trash" @click="handleDeleteItem(item.id)">Delete</UButton>
                  <div class="flex gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" @click="closeEdit">Cancel</UButton>
                    <UButton size="sm" :loading="saving" @click="handleSaveItem(item.id)">Save</UButton>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Empty section row -->
          <div
            v-if="!menuItemsBySection[section]?.length && addingItemSection !== section"
            class="border-b border-default px-4 py-3 text-sm text-muted last:border-0"
          >
            No items yet. Click <button class="underline" @click="openAddItem(section)">Add item</button> to get started.
          </div>

          <!-- Add item inline form -->
          <div v-if="addingItemSection === section" class="border-b border-default bg-elevated px-4 py-4 last:border-0">
            <div class="space-y-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Name">
                  <UInput v-model="addItemForm.name" placeholder="Item name" autofocus />
                </UFormField>
                <UFormField label="Price">
                  <UInput v-model="addItemForm.price" placeholder="฿250" />
                </UFormField>
              </div>
              <UFormField label="Description">
                <UTextarea v-model="addItemForm.description" :rows="2" placeholder="Short description..." />
              </UFormField>
              <UFormField label="Image">
                <MediaPicker
                  v-model="addItemForm.image_asset_id"
                  :site-id="props.siteId"
                  accept="image"
                  title="Item image"
                />
              </UFormField>
              <UCheckbox v-model="addItemForm.available" label="Available for ordering" />
              <div class="flex justify-end gap-2">
                <UButton color="neutral" variant="ghost" size="sm" @click="cancelAddItem(section)">Cancel</UButton>
                <UButton size="sm" :loading="saving" :disabled="!addItemForm.name.trim()" @click="handleAddItem(section)">Add item</UButton>
              </div>
            </div>
          </div>
        </template>

        <!-- Add section row (always last inside the list) -->
        <div v-if="!showAddSectionForm" class="flex justify-center px-4 py-3">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-heroicons-plus" @click="showAddSectionForm = true">
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
import { useToast } from '~/composables/useToast'

const props = defineProps<{
  siteId: string
  locationId?: string | null
}>()

const toast = useToast()

const {
  menus,
  currentMenu,
  loading,
  error,
  saving,
  hasMenus,
  menuItemsBySection,
  loadMenu,
  createMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} = useMenuEditor(props.siteId, props.locationId)

// Menu selector
const selectedMenuId = ref<string | null>(null)
const menuOptions = computed(() =>
  menus.value.map((m: any) => ({ value: m.id, label: m.name }))
)

watch(currentMenu, (menu: any) => {
  selectedMenuId.value = menu?.id ?? null
})

const handleMenuChange = async (id: string) => {
  await loadMenu(id)
}

const handleAiImport = async (menuId: string) => {
  await loadMenu(menuId)
}

// Create menu inline form
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
    toast.addToast('Failed to create menu', 'error')
  }
}

// Inline item editing
const expandedItemId = ref<string | null>(null)
const editForm = reactive({ name: '', description: '', price: '', available: true, image_asset_id: null as string | null })

const openEditItem = (item: any) => {
  expandedItemId.value = item.id
  editForm.name = item.name ?? ''
  editForm.description = item.description ?? ''
  editForm.price = item.price ?? ''
  editForm.available = item.available ?? true
  editForm.image_asset_id = item.image_asset_id ?? null
}

const closeEdit = () => {
  expandedItemId.value = null
}

const handleSaveItem = async (itemId: string) => {
  try {
    await updateMenuItem(itemId, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      price: editForm.price.trim() || undefined,
      available: editForm.available,
      image_asset_id: editForm.image_asset_id ?? undefined,
    })
    expandedItemId.value = null
    toast.addToast('Item saved', 'success')
  } catch (err) {
    console.error('handleSaveItem failed:', err)
    toast.addToast('Failed to save item', 'error')
  }
}

const handleDeleteItem = async (itemId: string) => {
  try {
    await deleteMenuItem(itemId)
    expandedItemId.value = null
    toast.addToast('Item deleted', 'success')
  } catch (err) {
    console.error('handleDeleteItem failed:', err)
    toast.addToast('Failed to delete item', 'error')
  }
}

// Add item inline form
const addingItemSection = ref<string | null>(null)
const addItemForm = reactive({ name: '', description: '', price: '', available: true, image_asset_id: null as string | null })

const openAddItem = (section: string) => {
  expandedItemId.value = null
  addItemForm.name = ''
  addItemForm.description = ''
  addItemForm.price = ''
  addItemForm.available = true
  addItemForm.image_asset_id = null
  addingItemSection.value = section
}

const cancelAddItem = (section: string) => {
  addingItemSection.value = null
  // Remove pending section if it still has no items
  if (pendingSections.value.includes(section) && !menuItemsBySection.value[section]?.length) {
    pendingSections.value = pendingSections.value.filter((s: string) => s !== section)
  }
}

const handleAddItem = async (section: string) => {
  if (!addItemForm.name.trim()) return
  try {
    await createMenuItem({
      name: addItemForm.name.trim(),
      description: addItemForm.description.trim() || undefined,
      price: addItemForm.price.trim() || undefined,
      available: addItemForm.available,
      image_asset_id: addItemForm.image_asset_id ?? undefined,
      section
    })
    pendingSections.value = pendingSections.value.filter((s: string) => s !== section)
    addingItemSection.value = null
    toast.addToast('Item added', 'success')
  } catch (err) {
    console.error('handleAddItem failed:', err)
    toast.addToast('Failed to add item', 'error')
  }
}

// Add section inline form
const pendingSections = ref<string[]>([])
const showAddSectionForm = ref(false)
const newSectionName = ref('')

const allSections = computed(() => {
  const existing = Object.keys(menuItemsBySection.value)
  const pending = pendingSections.value.filter((s: string) => !existing.includes(s))
  return [...existing, ...pending]
})

const handleAddSection = () => {
  const name = newSectionName.value.trim()
  if (!name) return
  if (!pendingSections.value.includes(name) && !Object.keys(menuItemsBySection.value).includes(name)) {
    pendingSections.value.push(name)
  }
  addingItemSection.value = name
  newSectionName.value = ''
  showAddSectionForm.value = false
}

const cancelAddSection = () => {
  newSectionName.value = ''
  showAddSectionForm.value = false
}
</script>

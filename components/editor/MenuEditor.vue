<template>
  <div class="space-y-4">
    <!-- Loading state -->
    <template v-if="loading">
      <USkeleton class="h-10 w-56" />
      <USkeleton class="h-48 w-full" />
      <USkeleton class="h-48 w-full" />
    </template>

    <!-- Error state -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="error"
    />

    <!-- No menus — empty state + inline create form -->
    <UCard v-else-if="!hasMenus">
      <div class="mx-auto max-w-md py-10 text-center">
        <UIcon name="i-heroicons-list-bullet" class="mx-auto size-10 text-(--ui-text-muted)" />
        <h2 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">No menus yet</h2>
        <p class="mt-2 text-sm text-(--ui-text-muted)">Create a menu to start adding sections and items.</p>
        <UButton v-if="!showCreateMenuForm" class="mt-6" icon="i-heroicons-plus" @click="showCreateMenuForm = true">
          Create Menu
        </UButton>
        <div v-else class="mt-6 space-y-4 text-left">
          <UFormField label="Menu Name">
            <UInput v-model="createMenuForm.name" placeholder="Dinner Menu" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createMenuForm.description" :rows="2" placeholder="Our evening selection..." />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showCreateMenuForm = false">Cancel</UButton>
            <UButton :loading="saving" :disabled="!createMenuForm.name.trim()" @click="handleCreateMenu">
              Create Menu
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Menu content -->
    <template v-else>
      <!-- Menu selector bar -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <USelect
            v-if="menuOptions.length > 1"
            v-model="selectedMenuId"
            :items="menuOptions"
            size="sm"
            @update:model-value="handleMenuChange"
          />
          <span v-else class="font-semibold text-(--ui-text-highlighted)">{{ currentMenu?.name }}</span>
          <UBadge
            :color="currentMenu?.status === 'published' ? 'success' : 'warning'"
            variant="soft"
            size="xs"
          >
            {{ currentMenu?.status }}
          </UBadge>
        </div>
        <UButton color="neutral" variant="soft" size="sm" icon="i-heroicons-plus" @click="showCreateMenuForm = true">
          New Menu
        </UButton>
      </div>

      <!-- Inline create menu form (when adding a second menu) -->
      <UCard v-if="showCreateMenuForm && hasMenus">
        <div class="space-y-4">
          <h3 class="font-semibold text-(--ui-text-highlighted)">New Menu</h3>
          <UFormField label="Menu Name">
            <UInput v-model="createMenuForm.name" placeholder="Lunch Menu" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createMenuForm.description" :rows="2" placeholder="Optional description..." />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showCreateMenuForm = false">Cancel</UButton>
            <UButton :loading="saving" :disabled="!createMenuForm.name.trim()" @click="handleCreateMenu">
              Create Menu
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Section cards -->
      <UCard v-for="section in allSections" :key="section">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <h3 class="font-semibold text-(--ui-text-highlighted)">{{ section }}</h3>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-heroicons-plus"
              @click="openAddItem(section)"
            >
              Add Item
            </UButton>
          </div>
        </template>

        <!-- Items list -->
        <div
          v-if="menuItemsBySection[section]?.length"
          class="divide-y divide-(--ui-border)"
        >
          <template v-for="item in menuItemsBySection[section]" :key="item.id">
            <!-- Collapsed item row — click to expand -->
            <div
              v-if="expandedItemId !== item.id"
              class="-mx-4 flex cursor-pointer items-center justify-between gap-4 px-4 py-3 transition hover:bg-(--ui-bg-elevated) first:rounded-t last:rounded-b"
              @click="openEditItem(item)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-(--ui-text-highlighted)">{{ item.name }}</span>
                  <UBadge
                    :color="item.available ? 'success' : 'neutral'"
                    variant="soft"
                    size="xs"
                  >
                    {{ item.available ? 'Available' : 'Unavailable' }}
                  </UBadge>
                </div>
                <div class="mt-0.5 flex items-center gap-3">
                  <span
                    v-if="item.description"
                    class="truncate text-sm text-(--ui-text-muted)"
                  >{{ item.description }}</span>
                  <span
                    v-if="item.price"
                    class="shrink-0 text-sm font-medium text-(--ui-text)"
                  >{{ item.price }}</span>
                </div>
              </div>
              <UIcon name="i-heroicons-pencil-square" class="size-4 shrink-0 text-(--ui-text-muted)" />
            </div>

            <!-- Expanded inline edit form -->
            <div v-else class="space-y-4 py-4 first:pt-0">
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Name">
                  <UInput v-model="editForm.name" placeholder="Item name" />
                </UFormField>
                <UFormField label="Price">
                  <UInput v-model="editForm.price" placeholder="฿250" />
                </UFormField>
              </div>
              <UFormField label="Description">
                <UTextarea v-model="editForm.description" :rows="2" placeholder="Short description..." />
              </UFormField>
              <UCheckbox v-model="editForm.available" label="Available for ordering" />
              <div class="flex items-center justify-between gap-2 pt-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-heroicons-trash"
                  @click="handleDeleteItem(item.id)"
                >
                  Delete
                </UButton>
                <div class="flex gap-2">
                  <UButton color="neutral" variant="ghost" size="sm" @click="closeEdit">Cancel</UButton>
                  <UButton size="sm" :loading="saving" @click="handleSaveItem(item.id)">Save</UButton>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Empty section — no items yet -->
        <p
          v-else-if="addingItemSection !== section"
          class="py-4 text-center text-sm text-(--ui-text-muted)"
        >
          No items yet.
        </p>

        <!-- Add item inline form -->
        <div
          v-if="addingItemSection === section"
          class="space-y-4 pt-4"
          :class="{ 'border-t border-(--ui-border) mt-4': menuItemsBySection[section]?.length }"
        >
          <div class="grid gap-4 sm:grid-cols-2">
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
          <UCheckbox v-model="addItemForm.available" label="Available for ordering" />
          <div class="flex justify-end gap-2 pt-1">
            <UButton color="neutral" variant="ghost" size="sm" @click="cancelAddItem(section)">Cancel</UButton>
            <UButton
              size="sm"
              :loading="saving"
              :disabled="!addItemForm.name.trim()"
              @click="handleAddItem(section)"
            >
              Add Item
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Add Section card -->
      <UCard>
        <div v-if="!showAddSectionForm" class="flex justify-center py-2">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-plus"
            @click="showAddSectionForm = true"
          >
            Add Section
          </UButton>
        </div>
        <div v-else class="space-y-4">
          <h3 class="font-semibold text-(--ui-text-highlighted)">New Section</h3>
          <UFormField label="Section Name">
            <UInput v-model="newSectionName" placeholder="Starters, Mains, Desserts..." autofocus />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="cancelAddSection">Cancel</UButton>
            <UButton size="sm" :disabled="!newSectionName.trim()" @click="handleAddSection">
              Create Section
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useMenuEditor } from '~/composables/useMenuEditor'

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
  menus.value.map(m => ({ value: m.id, label: m.name }))
)

watch(currentMenu, (menu) => {
  selectedMenuId.value = menu?.id ?? null
})

const handleMenuChange = async (id: string) => {
  await loadMenu(id)
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
  } catch {
    toast.add({ description: 'Failed to create menu', color: 'error' })
  }
}

// Inline item editing
const expandedItemId = ref<string | null>(null)
const editForm = reactive({ name: '', description: '', price: '', available: true })

const openEditItem = (item: any) => {
  expandedItemId.value = item.id
  editForm.name = item.name ?? ''
  editForm.description = item.description ?? ''
  editForm.price = item.price ?? ''
  editForm.available = item.available ?? true
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
      available: editForm.available
    })
    expandedItemId.value = null
    toast.add({ description: 'Item saved', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to save item', color: 'error' })
  }
}

const handleDeleteItem = async (itemId: string) => {
  try {
    await deleteMenuItem(itemId)
    expandedItemId.value = null
    toast.add({ description: 'Item deleted', color: 'neutral' })
  } catch {
    toast.add({ description: 'Failed to delete item', color: 'error' })
  }
}

// Add item inline form
const addingItemSection = ref<string | null>(null)
const addItemForm = reactive({ name: '', description: '', price: '', available: true })

const openAddItem = (section: string) => {
  expandedItemId.value = null
  addItemForm.name = ''
  addItemForm.description = ''
  addItemForm.price = ''
  addItemForm.available = true
  addingItemSection.value = section
}

const cancelAddItem = (section: string) => {
  addingItemSection.value = null
  // Remove pending section if it still has no items
  if (pendingSections.value.includes(section) && !menuItemsBySection.value[section]?.length) {
    pendingSections.value = pendingSections.value.filter(s => s !== section)
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
      section
    })
    pendingSections.value = pendingSections.value.filter(s => s !== section)
    addingItemSection.value = null
    toast.add({ description: 'Item added', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to add item', color: 'error' })
  }
}

// Add section inline form
const pendingSections = ref<string[]>([])
const showAddSectionForm = ref(false)
const newSectionName = ref('')

const allSections = computed(() => {
  const existing = Object.keys(menuItemsBySection.value)
  const pending = pendingSections.value.filter(s => !existing.includes(s))
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

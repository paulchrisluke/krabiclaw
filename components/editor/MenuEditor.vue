<template>
  <div class="menu-editor">
    <!-- Header with scope and menu selection -->
    <div class="mb-6 p-4 bg-white rounded-lg border border-stone-200">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-stone-900">Menu Editor</h2>
        <div class="flex items-center gap-4">
          <!-- Scope indicator -->
          <div class="text-sm text-stone-600">
            Editing: <span class="font-medium">{{ isEditingBrandMenu ? 'Brand-wide' : 'Location' }}</span>
          </div>
          
          <!-- Menu selector -->
          <USelect 
            v-if="hasMenus"
            v-model="selectedMenuId"
            @update:model-value="handleMenuChange"
            :items="menuOptions"
            size="sm"
          />
        </div>
      </div>

      <!-- Create new menu button -->
      <div v-if="!hasMenus" class="text-center py-8">
        <p class="text-stone-600 mb-4">No menus found for this scope</p>
        <UButton
          @click="createNewMenu"
          color="primary"
          size="sm"
        >
          Create New Menu
        </UButton>
      </div>
    </div>

    <!-- Current menu content -->
    <div v-if="hasCurrentMenu" class="space-y-6">
      <!-- Menu details -->
      <div class="p-4 bg-white rounded-lg border border-stone-200">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium">{{ currentMenu.name }}</h3>
          <div class="flex items-center gap-2">
            <UBadge 
              :color="currentMenu.status === 'published' ? 'success' : 'warning'" 
              variant="soft" 
              size="xs"
            >
              {{ currentMenu.status }}
            </UBadge>
            <UButton
              @click="showEditMenuModal = true"
              variant="ghost"
              color="info"
              size="sm"
            >
              Edit
            </UButton>
          </div>
        </div>
        <p v-if="currentMenu.description" class="text-stone-600 text-sm">
          {{ currentMenu.description }}
        </p>
      </div>

      <!-- Menu sections -->
      <div v-for="(items, section) in menuItemsBySection" :key="section" class="space-y-4">
        <div class="p-4 bg-white rounded-lg border border-stone-200">
          <h4 class="font-medium text-stone-900 mb-4">{{ section }}</h4>
          
          <div class="space-y-3">
            <div 
              v-for="item in items" 
              :key="item.id"
              class="flex items-center justify-between p-3 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
            >
              <div class="flex-1">
                <div class="font-medium text-stone-900">{{ item.name }}</div>
                <div v-if="item.description" class="text-sm text-stone-600 mt-1">
                  {{ item.description }}
                </div>
                <div v-if="item.price" class="text-sm font-medium text-stone-900 mt-1">
                  {{ item.price }}
                </div>
              </div>
              
              <div class="flex items-center gap-2">
                <span 
                  :class="[
                    'px-2 py-1 text-xs rounded',
                    item.available 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  ]"
                >
                  {{ item.available ? 'Available' : 'Unavailable' }}
                </span>
                
                <button
                  @click="editMenuItem(item)"
                  class="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Edit
                </button>
                
                <button
                  @click="handleDeleteMenuItem(item.id)"
                  class="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>

          <!-- Add item button -->
          <button
            @click="showAddItemModal = true; currentSection = section"
            class="mt-4 w-full px-3 py-2 border border-stone-300 text-stone-700 rounded hover:bg-stone-50 transition-colors"
          >
            + Add Item to {{ section }}
          </button>
        </div>
      </div>

      <!-- Add section button -->
      <div class="p-4 bg-white rounded-lg border border-stone-200">
        <button
          @click="showAddSectionModal = true"
          class="w-full px-4 py-3 border-2 border-dashed border-stone-300 text-stone-600 rounded hover:border-stone-400 hover:text-stone-700 transition-colors"
        >
          + Add Section
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-8">
      <p class="text-stone-600">Loading...</p>
    </div>

    <!-- Error state -->
    <div v-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Modals (simplified for now) -->
    <div v-if="showCreateMenuModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-96">
        <h3 class="text-lg font-medium mb-4">Create Menu</h3>
        <input 
          v-model="newMenuName"
          placeholder="Menu name"
          class="w-full px-3 py-2 border border-stone-300 rounded mb-4"
        />
        <textarea 
          v-model="newMenuDescription"
          placeholder="Description (optional)"
          class="w-full px-3 py-2 border border-stone-300 rounded mb-4"
          rows="3"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="showCreateMenuModal = false"
            class="px-4 py-2 text-stone-600 hover:text-stone-800"
          >
            Cancel
          </button>
          <button
            @click="handleCreateMenu"
            :disabled="!newMenuName || saving"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-stone-300"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMenuEditor } from '~/composables/useMenuEditor'

const props = defineProps({
  siteId: {
    type: String,
    required: true
  }
})

// Menu editor composable
const {
  menus,
  currentMenu,
  loading,
  error,
  saving,
  hasMenus,
  hasCurrentMenu,
  isEditingBrandMenu,
  menuItemsBySection,
  createMenu,
  updateMenu,
  deleteMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} = useMenuEditor(props.siteId)

// Local state
const selectedMenuId = ref<string | null>(null)
const showCreateMenuModal = ref(false)
const showEditMenuModal = ref(false)
const showAddItemModal = ref(false)
const showAddSectionModal = ref(false)
const newMenuName = ref('')
const newMenuDescription = ref('')
const currentSection = ref('')

// Sync selected menu with current menu
watch(currentMenu, (menu) => {
  if (menu) {
    selectedMenuId.value = menu.id
  } else {
    selectedMenuId.value = null
  }
})

// Handle menu selection change
const handleMenuChange = async () => {
  if (selectedMenuId.value) {
    // Load the selected menu
    await loadMenu(selectedMenuId.value)
  }
}

// Handle create menu
const handleCreateMenu = async () => {
  if (!newMenuName.value) return

  try {
    await createMenu({
      name: newMenuName.value,
      description: newMenuDescription.value || undefined
    })
    
    // Reset form
    newMenuName.value = ''
    newMenuDescription.value = ''
    showCreateMenuModal.value = false
  } catch (err) {
    console.error('Failed to create menu:', err)
  }
}

// Placeholder functions for modals
const editMenuItem = (item) => {
  console.log('Edit menu item:', item)
  // TODO: Implement edit item modal
}

const handleDeleteMenuItem = async (itemId) => {
  if (confirm('Are you sure you want to delete this menu item?')) {
    try {
      await deleteMenuItem(itemId)
    } catch (err) {
      console.error('Failed to delete menu item:', err)
    }
  }
}

const loadMenu = async (menuId) => {
  // This would be implemented in the composable
  console.log('Load menu:', menuId)
}
</script>

<style scoped>
.menu-editor {
  max-width: 4xl;
  margin: 0 auto;
}
</style>

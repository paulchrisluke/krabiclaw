<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="error"
      class="mb-6"
    />

    <template v-if="loading">
      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <UCard>
            <div class="space-y-4">
              <USkeleton class="h-10 w-full" />
              <USkeleton class="h-24 w-full" />
            </div>
          </UCard>
          <UCard>
            <USkeleton class="h-48 w-full" />
          </UCard>
        </div>
        <div class="space-y-6">
          <UCard><USkeleton class="h-20 w-full" /></UCard>
          <UCard><USkeleton class="h-28 w-full" /></UCard>
          <UCard><USkeleton class="h-40 w-full" /></UCard>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Main column -->
        <div class="space-y-6 lg:col-span-2">
          <UCard>
            <div class="space-y-4">
              <UFormField label="Name" required>
                <UInput v-model="form.name" placeholder="Karaage chicken" autofocus />
              </UFormField>
              <UFormField label="Description">
                <UTextarea v-model="form.description" :rows="4" placeholder="Short menu description..." />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">Image</p>
            </template>
            <MediaPicker
              v-model="form.image_asset_id"
              :site-id="siteId"
              :location-id="locationId"
              :initial-prompt="suggestedPrompt"
              :context="promptContext"
              accept="any"
              title="Item image or video"
            />
          </UCard>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">Status</p>
            </template>
            <div class="space-y-3">
              <UCheckbox v-model="form.available" label="Available for ordering" />
              <UCheckbox v-model="form.featured" label="Feature on homepage" />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">Organization</p>
            </template>
            <div class="space-y-4">
              <UFormField label="Section" required>
                <UInput v-if="sectionOptions.length === 0" v-model="form.section" placeholder="Mains" />
                <USelect v-else v-model="form.section" :items="sectionOptions" />
              </UFormField>
              <UFormField label="Price amount" :help="`Displayed in ${displayCurrency}. Change currency in Site Settings.`">
                <UInput v-model="form.price_amount" :placeholder="pricePlaceholder" />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">Details</p>
            </template>
            <div class="space-y-4">
              <UFormField label="Allergens">
                <UInput v-model="form.allergens" placeholder="Dairy, nuts, soy" />
              </UFormField>
              <UFormField label="Dietary tags">
                <UInput v-model="form.dietary_notes" placeholder="V, VG, GF, vegan" />
              </UFormField>
              <UFormField label="Preparation">
                <UInput v-model="form.preparation" placeholder="Grilled, steamed, spicy" />
              </UFormField>
              <UFormField label="Serving note">
                <UInput v-model="form.serving_note" placeholder="Served with rice" />
              </UFormField>
              <UFormField label="Ingredients">
                <UInput v-model="form.ingredients" placeholder="Chicken, garlic, ginger" />
              </UFormField>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Action bar -->
      <div class="mt-6 flex flex-col-reverse gap-2 border-t border-default pt-5 sm:flex-row sm:items-center sm:justify-between">
        <UButton
          v-if="itemId"
          color="error"
          variant="ghost"
          icon="i-heroicons-trash"
          :loading="deleting"
          @click="handleDelete"
        >
          Delete item
        </UButton>
        <div v-else />
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :to="backPath">Cancel</UButton>
          <UButton :loading="saving" :disabled="!canSave" @click="handleSave">
            {{ itemId ? 'Save item' : 'Create item' }}
          </UButton>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast'
import type { CreateMenuItemRequest, MenuItem, MenuWithItems, UpdateMenuItemRequest } from '~/server/types/menu'

const props = defineProps<{
  siteId: string
  menuId: string
  itemId?: string | null
  locationId?: string | null
  initialSection?: string | null
  defaultCurrency?: string
}>()

const emit = defineEmits<{
  'update:item-name': [name: string]
}>()

const router = useRouter()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const error = ref<string | null>(null)
const menu = ref<MenuWithItems | null>(null)

const form = reactive({
  section: props.initialSection || '',
  name: '',
  description: '',
  price_amount: '',
  available: true,
  featured: false,
  image_asset_id: null as string | null,
  allergens: '',
  ingredients: '',
  dietary_notes: '',
  preparation: '',
  serving_note: ''
})

watch(() => form.name, (name) => emit('update:item-name', name))

const siteId = computed(() => props.siteId)
const itemId = computed(() => props.itemId || null)
const locationId = computed(() => props.locationId || null)

const { menuPath } = useDashboardSiteLinks(props.siteId)
const backPath = computed(() => menuPath(props.locationId))

const sectionOptions = computed(() => {
  const sections = new Set((menu.value?.items || []).map((item: MenuItem) => item.section).filter(Boolean))
  if (form.section) sections.add(form.section)
  return Array.from(sections).map((section) => ({ label: section, value: section }))
})

const canSave = computed(() =>
  form.name.trim().length > 0 && form.section.trim().length > 0
)

watch(form, () => { error.value = null })

const suggestedPrompt = computed(() => {
  const name = form.name.trim()
  if (!name) return ''
  const parts = [name]
  if (form.section) parts.push(`(${form.section})`)
  if (form.description) parts.push(form.description.trim())
  if (form.preparation) parts.push(`preparation: ${form.preparation}`)
  if (form.serving_note) parts.push(`served ${form.serving_note}`)
  return parts.join(', ')
})

const promptContext = computed(() => {
  const parts: string[] = []
  if (form.name) parts.push(`Dish: ${form.name}`)
  if (form.section) parts.push(`Section: ${form.section}`)
  if (form.description) parts.push(`Description: ${form.description}`)
  if (form.dietary_notes) parts.push(`Dietary: ${form.dietary_notes}`)
  if (form.allergens) parts.push(`Allergens: ${form.allergens}`)
  if (form.ingredients) parts.push(`Ingredients: ${form.ingredients}`)
  if (form.preparation) parts.push(`Preparation: ${form.preparation}`)
  if (form.serving_note) parts.push(`Serving: ${form.serving_note}`)
  return parts.join('. ')
})

const displayCurrency = computed(() =>
  props.defaultCurrency?.trim()
    ? props.defaultCurrency.trim().toUpperCase()
    : 'USD'
)

const pricePlaceholder = computed(() => '250')

const splitList = (value: string) => value.split(',').map((part: string) => part.trim()).filter(Boolean)

const loadMenu = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<{ success: boolean; menu: MenuWithItems }>(
      `/api/editor/sites/${props.siteId}/menus/${props.menuId}`
    )

    if (!response.success) throw new Error('Failed to load menu')

    menu.value = response.menu
    const item = props.itemId ? response.menu.items.find((candidate: MenuItem) => candidate.id === props.itemId) : null

    if (props.itemId && !item) throw new Error('Menu item not found')

    if (item) {
      form.section = item.section || props.initialSection || ''
      form.name = item.name || ''
      form.description = item.description || ''
      form.price_amount = item.price_amount ? String(item.price_amount) : ''
      form.available = item.available
      form.featured = item.featured
      form.image_asset_id = item.image_asset_id || null
      form.allergens = (item.allergens || []).join(', ')
      form.ingredients = (item.ingredients || []).join(', ')
      form.dietary_notes = (item.dietary_notes || []).join(', ')
      form.preparation = item.preparation || ''
      form.serving_note = item.serving_note || ''
      emit('update:item-name', form.name)
    } else if (!form.section) {
      form.section = sectionOptions.value[0]?.value || 'Uncategorized'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load menu item'
  } finally {
    loading.value = false
  }
}

const payload = computed<CreateMenuItemRequest & UpdateMenuItemRequest>(() => ({
  section: form.section.trim(),
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  price_amount: form.price_amount.trim() || undefined,
  available: form.available,
  featured: form.featured,
  image_asset_id: form.image_asset_id,
  allergens: splitList(form.allergens),
  ingredients: splitList(form.ingredients),
  dietary_notes: splitList(form.dietary_notes),
  preparation: form.preparation.trim() || undefined,
  serving_note: form.serving_note.trim() || undefined
}))

const handleSave = async () => {
  if (!canSave.value) return
  saving.value = true
  error.value = null

  try {
    if (props.itemId) {
      await $fetch(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items/${props.itemId}`, {
        method: 'PATCH',
        body: payload.value
      })
      toast.addToast('Item saved', 'success')
    } else {
      await $fetch(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items`, {
        method: 'POST',
        body: payload.value
      })
      toast.addToast('Item created', 'success')
    }
    await router.push(backPath.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save menu item'
    toast.addToast('Failed to save item', 'error')
  } finally {
    saving.value = false
  }
}

const handleDelete = async () => {
  if (!props.itemId) return
  deleting.value = true
  error.value = null

  try {
    await $fetch(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items/${props.itemId}`, {
      method: 'DELETE'
    })
    toast.addToast('Item deleted', 'success')
    await router.push(backPath.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete menu item'
    toast.addToast('Failed to delete item', 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(loadMenu)
</script>

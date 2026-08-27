<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
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
              :model-value="coverAssetId"
              @update:model-value="handleCoverChange"
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
              <UFormField label="Compare-at price" help="Optional. The regular/pre-sale price shown struck through when running a sale. Leave empty when not on sale.">
                <UInput v-model="form.compare_at_price_amount" :placeholder="pricePlaceholder" />
              </UFormField>
              <UFormField label="Sale starts" help="Optional. Leave empty to start immediately.">
                <UInput v-model="form.sale_starts_at" type="date" />
              </UFormField>
              <UFormField label="Sale ends" help="Optional. Leave empty for no end date.">
                <UInput v-model="form.sale_ends_at" type="date" />
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
      <div class="mt-6 flex flex-col-reverse gap-2 border-t border-default pt-5 pb-safe sticky bottom-0 bg-default z-10 sm:flex-row sm:items-center sm:justify-between sm:pb-5 sm:static">
        <UButton
          v-if="itemId"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
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
import type { CreateMenuItemRequest, MenuItem, MenuWithItems, UpdateMenuItemRequest } from '~/server/types/menu'

const dashboardApi = useDashboardApi()
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
const { trackMenuItemCreated, trackEditorSessionStarted } = useAnalytics()

onMounted(() => {
  if (props.siteId) trackEditorSessionStarted(props.siteId)
})

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
  compare_at_price_amount: '',
  sale_starts_at: '',
  sale_ends_at: '',
  available: true,
  featured: false,
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

// menu_item:gallery is an ordered collection with exactly one member in this
// editor today (there is no multi-photo grid here), so it's managed as a
// single cover image — but membership still only ever changes through the
// generic attach/remove routes, never a full-array save, so a stale reload
// of this page can never resurrect a photo someone else removed elsewhere.
const coverAssetId = ref<string | null>(null)
const coverPlacement = computed(() => ({ owner_type: 'menu_item' as const, owner_id: props.itemId ?? '', slot: 'gallery' }))

async function handleCoverChange(nextAssetId: string | null) {
  const previous = coverAssetId.value
  if (nextAssetId === previous) return
  if (!props.itemId) {
    // Item doesn't exist yet — held locally and attached once created.
    coverAssetId.value = nextAssetId
    return
  }
  const validate = (value: unknown): value is { asset_ids: string[] } => isRecord(value) && Array.isArray(value.asset_ids)
  try {
    // Attach the new cover before removing the old one, so a failed attach
    // leaves the previous cover intact instead of leaving the item with none.
    if (nextAssetId) {
      const result = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/attach`, {
        method: 'POST',
        body: { placement: coverPlacement.value, asset_id: nextAssetId },
        validate,
      })
      coverAssetId.value = result.asset_ids.find(id => id !== previous) ?? nextAssetId
    }
    if (previous) {
      const result = await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements/remove`, {
        method: 'POST',
        body: { placement: coverPlacement.value, asset_id: previous },
        validate,
      })
      coverAssetId.value = result.asset_ids[0] ?? null
    }
  } catch (err) {
    toast.add({ description: err instanceof Error ? err.message : 'Failed to update item image', color: 'error' })
  }
}

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

const isMenuItem = (value: unknown): value is MenuItem =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.name === 'string'
  && typeof value.section === 'string'

const isMenuResponse = (value: unknown): value is { success: boolean; menu: MenuWithItems } =>
  isRecord(value)
  && typeof value.success === 'boolean'
  && isRecord(value.menu)
  && typeof value.menu.id === 'string'
  && Array.isArray(value.menu.items)
  && value.menu.items.every(isMenuItem)

const applyMenu = (loadedMenu: MenuWithItems) => {
  menu.value = loadedMenu
  const item = props.itemId
    ? loadedMenu.items.find((candidate: MenuItem) => candidate.id === props.itemId)
    : null
  if (props.itemId && !item) throw createError({ statusCode: 404, statusMessage: 'Menu item not found' })
  if (item) {
    form.section = item.section || props.initialSection || ''
    form.name = item.name || ''
    form.description = item.description || ''
    form.price_amount = item.price_amount ? String(item.price_amount) : ''
    form.compare_at_price_amount = item.compare_at_price_amount ? String(item.compare_at_price_amount) : ''
    form.sale_starts_at = item.sale_starts_at ? item.sale_starts_at.slice(0, 10) : ''
    form.sale_ends_at = item.sale_ends_at ? item.sale_ends_at.slice(0, 10) : ''
    form.available = item.available
    form.featured = item.featured
    coverAssetId.value = item.media?.[0]?.asset_id ?? null
    form.allergens = (item.allergens || []).join(', ')
    form.ingredients = (item.ingredients || []).join(', ')
    form.dietary_notes = (item.dietary_notes || []).join(', ')
    form.preparation = item.preparation || ''
    form.serving_note = item.serving_note || ''
    emit('update:item-name', form.name)
  } else if (!form.section) {
    form.section = sectionOptions.value[0]?.value || 'Uncategorized'
  }
}

const requestEvent = useRequestEvent()
const { data: menuResource, pending: menuPending, error: menuResourceError } = await useAsyncData(
  `dashboard-menu:${props.siteId}:${props.menuId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardMenu } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardMenu(requestEvent, props.siteId, props.menuId)
    }
    return await dashboardApi<{ success: boolean; menu: MenuWithItems }>(
      `/api/editor/sites/${props.siteId}/menus/${props.menuId}`,
      { validate: isMenuResponse },
    )
  },
  { lazy: import.meta.client },
)

watch([menuResource, menuPending, menuResourceError], ([resource, pending, resourceError]) => {
  loading.value = pending
  if (resourceError) {
    error.value = resourceError instanceof Error ? resourceError.message : 'Failed to load menu item'
    return
  }
  if (!resource) return
  try {
    applyMenu(resource.menu)
    error.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to load menu item'
  }
}, { immediate: true })

const payload = computed<CreateMenuItemRequest & UpdateMenuItemRequest>(() => ({
  section: form.section.trim(),
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  price_amount: form.price_amount.trim() || undefined,
  compare_at_price_amount: form.compare_at_price_amount.trim() || null,
  sale_starts_at: form.sale_starts_at.trim() || null,
  sale_ends_at: form.sale_ends_at.trim() || null,
  available: form.available,
  featured: form.featured,
  // Media is not part of this payload: menu_item:gallery membership only
  // ever changes through handleCoverChange's direct attach/remove calls
  // (create-time initial attach is handled separately below), never a
  // full-array field on the entity save.
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
      await dashboardApi(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items/${props.itemId}`, {
        method: 'PATCH',
        body: payload.value,
        validate: (value): value is { menuItem: MenuItem } =>
          isRecord(value) && isMenuItem(value.menuItem),
      })
      toast.add({ description: 'Item saved', color: 'success' })
    } else {
      const res = await dashboardApi<{ menuItem: MenuItem }>(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items`, {
        method: 'POST',
        body: { ...payload.value, media: coverAssetId.value ? [{ asset_id: coverAssetId.value }] : [] },
        validate: (value): value is { menuItem: MenuItem } =>
          isRecord(value) && isMenuItem(value.menuItem),
      })
      if (res?.menuItem?.id) {
        trackMenuItemCreated(String(res.menuItem.id), props.siteId)
        toast.add({ description: 'Item created', color: 'success' })
      } else {
        error.value = 'Invalid response: missing menuItem or id'
        toast.add({ description: 'Failed to create item', color: 'error' })
        return
      }
    }
    await router.push(backPath.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save menu item'
    toast.add({ description: 'Failed to save item', color: 'error' })
  } finally {
    saving.value = false
  }
}

const handleDelete = async () => {
  if (!props.itemId) return
  deleting.value = true
  error.value = null

  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/menus/${props.menuId}/items/${props.itemId}`, {
      method: 'DELETE',
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    toast.add({ description: 'Item deleted', color: 'success' })
    await router.push(backPath.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete menu item'
    toast.add({ description: 'Failed to delete item', color: 'error' })
  } finally {
    deleting.value = false
  }
}

</script>

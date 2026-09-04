<template>
  <UDashboardPanel id="location-products">
    <template #header>
      <UDashboardNavbar :title="presentation.collectionLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading v-if="locationPaths" :to="locationPaths.location" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DashboardListEditor
        v-model:editing="editing"
        :title="presentation.collectionLabel"
        :description="`Group ${presentation.itemLabel.toLowerCase()}s into ${presentation.categoryLabel.toLowerCase()}s. Customers see them in this order.`"
        :items="listItems"
        :pending="pending"
        :error="loadError"
        :empty-title="`No ${presentation.categoryLabel.toLowerCase()}s yet`"
        empty-icon="i-lucide-layout-list"
        :add-label="`Add a ${presentation.categoryLabel.toLowerCase()}`"
        reorderable
        :removing-id="removingId"
        @add="openNew"
        @open="openExisting"
        @remove="removeCategory"
        @move="moveCategory"
      >
        <template #item="{ item }">
          <!--
            The row body is the way in. Reordering and renaming live in the edit
            state beside it, so browsing never has to step around edit controls.
          -->
          <NuxtLink :to="`${productsPath}/${item.id}`" class="block no-underline" :data-testid="`product-category-${item.id}`">
            <p class="truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</p>
            <p class="mt-1 text-sm text-muted">{{ item.row.product_count === 1 ? `1 ${presentation.itemLabel.toLowerCase()}` : `${item.row.product_count} ${presentation.itemLabel.toLowerCase()}s` }}</p>
          </NuxtLink>
        </template>
      </DashboardListEditor>

      <DashboardListItemDialog
        v-model:open="dialogOpen"
        :title="editingId ? `Rename ${presentation.categoryLabel.toLowerCase()}` : `Add a ${presentation.categoryLabel.toLowerCase()}`"
        :removable="false"
        :saving="saving"
        :save-disabled="!name.trim()"
        @save="saveCategory"
      >
        <UFormField label="Name">
          <UInput v-model="name" :placeholder="presentation.categoryLabel === 'Section' ? 'Appetizers' : 'Accessories'" autofocus class="w-full" />
        </UFormField>
      </DashboardListItemDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import type { ProductCategory } from '~/server/types/products'
import { getErrorMessage } from '~/utils/errors'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const dashboardApi = useDashboardApi()
const toast = useToast()
const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
const presentation = requireProductPresentation(vertical)
useSeoMeta({ title: `${presentation.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
const productsPath = computed(() => locationPaths.value?.products ?? '')

interface CategoryRow extends ProductCategory { product_count: number }

const categories = ref<CategoryRow[]>([])
const pending = ref(true)
const loadError = ref<string | null>(null)
const editing = ref(false)
const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const name = ref('')
const saving = ref(false)
const removingId = ref<string | null>(null)

const listItems = computed(() => categories.value.map(row => ({ id: row.id, title: row.name, row })))

function isCategoryList(value: unknown): value is { categories: ProductCategory[] } {
  return isRecord(value) && Array.isArray(value.categories)
}
function isProductList(value: unknown): value is { success: true; products: Array<{ category_id: string }> } {
  return isRecord(value) && Array.isArray(value.products)
}

async function load() {
  const id = locationId.value
  if (!id) return
  pending.value = true
  loadError.value = null
  try {
    // The count is what makes a category legible at a glance, and it is the
    // only reason this level reads Products at all.
    const [categoryResponse, productResponse] = await Promise.all([
      dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/categories`, { validate: isCategoryList }),
      dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products`, { validate: isProductList }),
    ])
    const counts = new Map<string, number>()
    for (const product of productResponse.products) counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1)
    categories.value = categoryResponse.categories.map(row => ({ ...row, product_count: counts.get(row.id) ?? 0 }))
  } catch (error) {
    loadError.value = getErrorMessage(error, `Failed to load ${presentation.categoryLabel.toLowerCase()}s`)
  } finally {
    pending.value = false
  }
}

function openNew() {
  editingId.value = null
  name.value = ''
  dialogOpen.value = true
}

function openExisting(item: { row: CategoryRow }) {
  editingId.value = item.row.id
  name.value = item.row.name
  dialogOpen.value = true
}

async function saveCategory() {
  const id = locationId.value
  if (!id || !name.value.trim()) return
  saving.value = true
  try {
    const endpoint = `/api/editor/sites/${siteId}/locations/${id}/products/categories`
    if (editingId.value) {
      await dashboardApi(`${endpoint}/${editingId.value}`, { method: 'PATCH', body: { name: name.value.trim() }, validate: isRecord })
    } else {
      await dashboardApi(endpoint, { method: 'POST', body: { name: name.value.trim() }, validate: isRecord })
    }
    dialogOpen.value = false
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to save ${presentation.categoryLabel.toLowerCase()}`), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function removeCategory(item: { row: CategoryRow }) {
  const id = locationId.value
  if (!id) return
  const count = item.row.product_count
  const warning = count
    ? `Delete "${item.row.name}" and its ${count} ${count === 1 ? presentation.itemLabel.toLowerCase() : `${presentation.itemLabel.toLowerCase()}s`}?`
    : `Delete "${item.row.name}"?`
  if (!confirm(warning)) return
  removingId.value = item.row.id
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/categories/${item.row.id}`, { method: 'DELETE', validate: isRecord })
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to delete ${presentation.categoryLabel.toLowerCase()}`), color: 'error' })
  } finally {
    removingId.value = null
  }
}

/**
 * Reordering stays local while the edit state is open and commits once when it
 * closes. Every press used to be a request plus a full reload, which is what
 * made a six-place move feel broken.
 */
function moveCategory(item: { row: CategoryRow }, direction: -1 | 1) {
  const index = categories.value.findIndex(row => row.id === item.row.id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= categories.value.length) return
  const next = [...categories.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  categories.value = next
  orderDirty.value = true
}

const orderDirty = ref(false)

async function commitOrder() {
  const id = locationId.value
  if (!id || !orderDirty.value) return
  orderDirty.value = false
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/categories/order`, {
      method: 'PUT',
      body: { category_ids: categories.value.map(row => row.id) },
      validate: isRecord,
    })
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save the new order'), color: 'error' })
    await load()
  }
}

watch(editing, (value, previous) => {
  if (previous && !value) void commitOrder()
})

watch(locationId, () => {
  editing.value = false
  dialogOpen.value = false
  void load()
}, { immediate: true })
</script>

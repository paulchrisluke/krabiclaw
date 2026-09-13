<template>
  <div class="space-y-6">
  <DashboardListEditor
    v-model:editing="editing"
    :title="presentation.collectionLabel"
    :description="`Group ${presentation.itemLabelPlural.toLowerCase()} into ${presentation.collectionGroupLabelPlural.toLowerCase()}. Customers see them in this order.`"
    :items="listItems"
    :pending="pending"
    :error="loadError"
    :empty-title="`No ${presentation.collectionGroupLabelPlural.toLowerCase()} yet`"
    empty-icon="i-lucide-layout-list"
    :add-label="`Add a ${presentation.collectionGroupLabel.toLowerCase()}`"
    reorderable
    :removing-id="removingId"
    @add="openNew"
    @open="openExisting"
    @remove="removeCollection"
    @move="moveCollection"
  >
    <template #item="{ item }">
      <!--
        The row body is the way in. Reordering and renaming live in the edit
        state beside it, so browsing never has to step around edit controls.
      -->
      <NuxtLink :to="`${productsPath}/${item.id}`" class="flex items-center gap-4 no-underline" :data-testid="`collection-${item.id}`">
        <DashboardMediaThumb :asset="item.row.cover" :label="item.row.name" fallback-icon="i-lucide-layout-list" />
        <span class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</p>
        <p class="mt-1 text-sm text-muted">{{ item.row.product_count === 1 ? `1 ${item.row.words.itemLabel.toLowerCase()}` : `${item.row.product_count} ${item.row.words.itemLabelPlural.toLowerCase()}` }}</p>
        </span>
      </NuxtLink>
    </template>
  </DashboardListEditor>

  </div>
</template>

<script setup lang="ts">
// The collections index. Rendered by `products.vue`, which decides whether it
// is the whole screen, the index column of a pair, or off screen entirely.
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardMediaThumb from '~/components/dashboard/DashboardMediaThumb.vue'
import type { Collection, Product, ProductPresentation } from '~/server/types/products'
import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import { getErrorMessage } from '~/utils/errors'
import { presentationForProducts } from '~/utils/product-presentation'


const dashboardApi = useDashboardApi()
const route = useRoute()
const toast = useToast()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)

// The cover is the first Product in the category that has a photo, which is how
// the category reads on the public site too.
interface CollectionRow extends Collection { product_count: number; cover: ResolvedMediaAsset | null; words: ProductPresentation }

const catalog = useLocationProductCatalog(siteId, locationId)
const pending = catalog.pending
// The words follow what is being managed: a studio's catalogue is experiences,
// a restaurant's is its menu, and one collection of classes on a menu counts
// its own members as experiences.
const presentation = computed(() => presentationForProducts(vertical, catalog.products.value))
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${presentation.value.collectionGroupLabelPlural.toLowerCase()}`) : null))
useSeoMeta({ title: () => `${presentation.value.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

// The count and cover are what make a category legible at a glance, and they
// are the only reason this level reads Items at all.
const catalogRows = computed<CollectionRow[]>(() => {
  // Membership is a relationship, so a product counts once in every collection
  // it belongs to — which is the point: it is one product in several places,
  // not several products.
  const counts = new Map<string, number>()
  const covers = new Map<string, ResolvedMediaAsset>()
  const members = new Map<string, Product[]>()
  for (const product of catalog.products.value) {
    for (const membership of product.collections) {
      counts.set(membership.collection_id, (counts.get(membership.collection_id) ?? 0) + 1)
      members.set(membership.collection_id, [...(members.get(membership.collection_id) ?? []), product])
      if (product.image && !covers.has(membership.collection_id)) covers.set(membership.collection_id, product.image)
    }
  }
  return catalog.collections.value.map(row => ({
    ...row,
    product_count: counts.get(row.id) ?? 0,
    cover: covers.get(row.id) ?? null,
    words: presentationForProducts(vertical, members.get(row.id) ?? []),
  }))
})

// Reorder is a mode: the local order stands while the edit state is open and
// commits once when it closes, so it is held apart from the shared catalog.
const localOrder = ref<CollectionRow[] | null>(null)
const collections = computed<CollectionRow[]>(() => localOrder.value ?? catalogRows.value)
const editing = ref(false)
const removingId = ref<string | null>(null)

const listItems = computed(() => collections.value.map(row => ({ id: row.id, title: row.name, row })))

const load = catalog.refresh


// A category is a record with its own level: adding opens `new`, and renaming
// opens its Name leaf.
function openNew() {
  void navigateTo(`${productsPath.value}/new`)
}

function openExisting(item: { row: CollectionRow }) {
  void navigateTo(`${productsPath.value}/${item.row.id}/name`)
}

async function removeCollection(item: { row: CollectionRow }) {
  const id = locationId.value
  if (!id) return
  const count = item.row.product_count
  const warning = count
    ? `Delete "${item.row.name}" and its ${count} ${count === 1 ? item.row.words.itemLabel.toLowerCase() : `${item.row.words.itemLabelPlural.toLowerCase()}`}?`
    : `Delete "${item.row.name}"?`
  if (!confirm(warning)) return
  removingId.value = item.row.id
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/collections/${item.row.id}`, { method: 'DELETE', validate: isRecord })
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to delete ${presentation.value.collectionGroupLabel.toLowerCase()}`), color: 'error' })
  } finally {
    removingId.value = null
  }
}

/**
 * Reordering stays local while the edit state is open and commits once when it
 * closes. Every press used to be a request plus a full reload, which is what
 * made a six-place move feel broken.
 */
function moveCollection(item: { row: CollectionRow }, direction: -1 | 1) {
  const index = collections.value.findIndex(row => row.id === item.row.id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= collections.value.length) return
  const next = [...collections.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  localOrder.value = next
  orderDirty.value = true
}

const orderDirty = ref(false)

async function commitOrder() {
  const id = locationId.value
  if (!id || !orderDirty.value) return
  orderDirty.value = false
  const order = collections.value.map(row => row.id)
  localOrder.value = null
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/collections/order`, {
      method: 'PUT',
      body: { collection_ids: order, location_id: id },
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
  orderDirty.value = false
  localOrder.value = null
  editing.value = false
  void load()
}, { immediate: true })
</script>

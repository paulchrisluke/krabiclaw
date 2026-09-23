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
    @remove="removeCollection"
    @move="moveCollection"
  >
    <template #item="{ item }">
      <!--
        Reordering and renaming live in the edit state beside the row, so
        browsing never has to step around edit controls.
      -->
      <span class="flex items-center gap-4" :data-testid="`collection-${item.id}`">
        <DashboardMediaThumb :asset="item.row.cover" :label="item.row.name" fallback-icon="i-lucide-layout-list" />
        <span class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</p>
        <p class="mt-1 text-sm text-muted">{{ item.row.product_count === 1 ? `1 ${presentation.itemLabel.toLowerCase()}` : `${item.row.product_count} ${presentation.itemLabelPlural.toLowerCase()}` }}</p>
        </span>
      </span>
    </template>
  </DashboardListEditor>
  <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="deleteError" />
  <UAlert v-if="orderError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="orderError" />

  </div>
</template>

<script setup lang="ts">
// One surface's collections. Rendered by `[surface].vue`, which decides whether
// it is the whole screen, the index column of a pair, or off screen entirely.
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardMediaThumb from '~/components/dashboard/DashboardMediaThumb.vue'
import type { Collection, Product, ProductSurface } from '~/server/types/products'
import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import { getErrorMessage } from '~/utils/errors'
import { collectionsOnSurface, presentationForSurface } from '~/utils/product-presentation'

const props = defineProps<{ surface: ProductSurface }>()

const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()
const dashboard = useDashboardOrganization()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.organization.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// The words are the surface's own: a collection of classes is read as
// experiences, a section of a menu as dishes.
const presentation = computed(() => presentationForSurface(vertical, props.surface))

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const level = useRouteLevel()

// The cover is the first Product in the collection that has a photo, which is
// how the collection reads on the public site too.
interface CollectionRow extends Collection {
  product_count: number
  cover: ResolvedMediaAsset | null
  /** The members, which are what put this collection on a surface. */
  products: Product[]
}

const catalog = useLocationProductCatalog(organizationId, locationId)
const pending = catalog.pending

// The count and cover are what make a collection legible at a glance, and they
// are the only reason this level reads Items at all.
const catalogRows = computed<CollectionRow[]>(() => {
  // Membership is a relationship, so a product counts once in every collection
  // it belongs to — which is the point: it is one product in several places,
  // not several products.
  const covers = new Map<string, ResolvedMediaAsset>()
  const members = new Map<string, Product[]>()
  for (const product of catalog.products.value) {
    for (const membership of product.collections) {
      members.set(membership.collection_id, [...(members.get(membership.collection_id) ?? []), product])
      if (product.image && !covers.has(membership.collection_id)) covers.set(membership.collection_id, product.image)
    }
  }
  return catalog.collections.value.map((row) => {
    const products = members.get(row.id) ?? []
    return { ...row, product_count: products.length, cover: covers.get(row.id) ?? null, products }
  })
})

// Reorder is a mode: the local order stands while the edit state is open and
// commits once when it closes, so it is held apart from the shared catalog.
const localOrder = ref<CollectionRow[] | null>(null)
/** Every collection this location has, in the one order it stores. */
const collections = computed<CollectionRow[]>(() => localOrder.value ?? catalogRows.value)
/**
 * The ones this surface manages, in that same order, each holding only its
 * members on this surface — so the count and the cover describe what the owner
 * opens, not what the collection holds altogether.
 */
const onSurface = computed<CollectionRow[]>(() =>
  collectionsOnSurface(vertical, collections.value, props.surface).map(row => ({
    ...row,
    product_count: row.products.length,
    cover: row.products.find(product => product.image)?.image ?? null,
  })))
const editing = ref(false)
const removingId = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const orderError = ref<string | null>(null)

const listItems = computed(() => onSurface.value.map(row => ({ id: row.id, title: row.name, to: `${level.path.value}/${row.id}`, row })))
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${presentation.value.collectionGroupLabelPlural.toLowerCase()}`) : null))
useSeoMeta({ title: () => `${presentation.value.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

const load = catalog.refresh


// A collection is a record with its own level: adding opens `new`, and the row
// opens the record, whose Name leaf is one of its rows.
function openNew() {
  void navigateTo(`${level.path.value}/new`)
}



async function removeCollection(item: { row: CollectionRow }) {
  const id = locationId.value
  if (!id) return
  const count = item.row.product_count
  const words = presentation.value
  const warning = count
    ? `Delete "${item.row.name}" and its ${count} ${count === 1 ? words.itemLabel.toLowerCase() : words.itemLabelPlural.toLowerCase()}?`
    : `Delete "${item.row.name}"?`
  if (!confirm(warning)) return
  removingId.value = item.row.id
  deleteError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/collections/${item.row.id}`, { method: 'DELETE', validate: isRecord })
    await load()
  } catch (error) {
    deleteError.value = getErrorMessage(error, `Failed to delete ${words.collectionGroupLabel.toLowerCase()}`)
  } finally {
    removingId.value = null
  }
}

/**
 * Reordering stays local while the edit state is open and commits once when it
 * closes. Every press used to be a request plus a full reload, which is what
 * made a six-place move feel broken.
 *
 * A move is within this surface: the row swaps places with its neighbour here,
 * and every collection the other surface manages keeps the position it holds in
 * the one order the location stores. There is no second order to keep in step.
 */
function moveCollection(item: { row: CollectionRow }, direction: -1 | 1) {
  const here = onSurface.value.findIndex(row => row.id === item.row.id)
  const neighbour = onSurface.value[here + direction]
  if (here < 0 || !neighbour) return
  const order = [...collections.value]
  const from = order.findIndex(row => row.id === item.row.id)
  const to = order.findIndex(row => row.id === neighbour.id)
  if (from < 0 || to < 0) return
  order[from] = collections.value[to]!
  order[to] = collections.value[from]!
  localOrder.value = order
  orderDirty.value = true
}

const orderDirty = ref(false)

async function commitOrder() {
  const id = locationId.value
  if (!id || !orderDirty.value) return
  orderDirty.value = false
  // The whole intended order for the location, which is the only order there
  // is: the endpoint takes it complete and rejects a partial one.
  const order = collections.value.map(row => row.id)
  localOrder.value = null
  orderError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/collections/order`, {
      method: 'PUT',
      body: { collection_ids: order, location_id: id },
      validate: isRecord,
    })
  } catch (error) {
    orderError.value = getErrorMessage(error, 'Failed to save the new order')
    await load()
  }
}

watch(editing, (value, previous) => {
  if (previous && !value) void commitOrder()
})

// Resets this list's own edit state when the catalog underneath it changes.
// It does not refetch: the catalog is one keyed `useAsyncData` whose key holds
// the location, so it reloads itself. Calling `refresh` here as well turned
// `pending` true for every level sharing that key, and the server rendered the
// catalog column as skeletons while the payload beside it already held the rows.
watch([locationId, () => props.surface], () => {
  orderDirty.value = false
  localOrder.value = null
  editing.value = false
}, { immediate: true })
</script>

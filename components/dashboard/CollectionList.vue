<template>
  <div class="space-y-6">
  <DashboardListEditor
    v-model:editing="editing"
    :title="title"
    :description="description"
    :items="listItems"
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
// One scope's collections — the site-wide ones, or one location's own — in the
// order customers see them. Catalog renders one of these per scope it shows,
// because order, Add and reorder each belong to exactly one scope.
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardMediaThumb from '~/components/dashboard/DashboardMediaThumb.vue'
import type { Collection, Product } from '~/server/types/products'
import type { ResolvedMediaAsset } from '~/server/utils/media-asset-manager'
import { getErrorMessage } from '~/utils/errors'
import { requireProductPresentation } from '~/utils/product-presentation'

const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const organizationId = await useDashboardOrganizationId()
const dashboard = useDashboardOrganization()

const vertical = dashboard.organization.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Organization vertical is not configured' })
// The organization's own words for a grouping: a restaurant's Sections, everyone else's Collections.
const presentation = computed(() => requireProductPresentation(vertical, dashboard.organization.value?.theme_id))

const props = defineProps<{
  /** The location these collections belong to, or null for the site-wide ones. */
  scope: string | null
  title: string
  description?: string
}>()

const locationId = useLocationScope()
const catalogPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/products`)

// The cover is the first Product in the collection that has a photo, which is
// how the collection reads on the public site too.
interface CollectionRow extends Collection {
  product_count: number
  cover: ResolvedMediaAsset | null
  /** The products that belong to it. */
  products: Product[]
}

const catalog = useProductCatalog(organizationId, locationId)

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
  return catalog.collections.value.filter(row => row.location_id === props.scope).map((row) => {
    const products = members.get(row.id) ?? []
    return { ...row, product_count: products.length, cover: covers.get(row.id) ?? null, products }
  })
})

// Reorder is a mode: the local order stands while the edit state is open and
// commits once when it closes, so it is held apart from the shared catalog.
const localOrder = ref<CollectionRow[] | null>(null)
/** Every collection in this scope, in the one order it stores. */
const collections = computed<CollectionRow[]>(() => localOrder.value ?? catalogRows.value)
const editing = ref(false)
const removingId = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const orderError = ref<string | null>(null)

/** A path in Catalog's scope: the explicit location rides along. */
const scoped = (path: string) => router.resolve({ path, query: { location_id: route.query.location_id } }).fullPath
const listItems = computed(() => collections.value.map(row => ({ id: row.id, title: row.name, to: scoped(`${catalogPath.value}/collections/${row.id}`), row })))
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${presentation.value.collectionGroupLabelPlural.toLowerCase()}`) : null))

const load = catalog.refresh


// A collection is a record with its own level: adding opens `new` in this
// list's scope, and the row opens the record, whose Name leaf is one of its rows.
function openNew() {
  void navigateTo(router.resolve({ path: `${catalogPath.value}/collections/new`, query: { location_id: props.scope ?? undefined } }).fullPath)
}



async function removeCollection(item: { row: CollectionRow }) {
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
 * The row swaps places with its neighbour in the one order this scope stores.
 */
function moveCollection(item: { row: CollectionRow }, direction: -1 | 1) {
  const from = collections.value.findIndex(row => row.id === item.row.id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= collections.value.length) return
  const order = [...collections.value]
  order[from] = collections.value[to]!
  order[to] = collections.value[from]!
  localOrder.value = order
  orderDirty.value = true
}

const orderDirty = ref(false)

async function commitOrder() {
  if (!orderDirty.value) return
  orderDirty.value = false
  // The whole intended order for this scope — the site's own collections, or
  // one location's — which is the only order there is: the endpoint takes it
  // complete and rejects a partial one.
  const order = collections.value.map(row => row.id)
  localOrder.value = null
  orderError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/collections/order`, {
      method: 'PUT',
      body: { collection_ids: order, location_id: props.scope },
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
watch(locationId, () => {
  orderDirty.value = false
  localOrder.value = null
  editing.value = false
}, { immediate: true })
</script>

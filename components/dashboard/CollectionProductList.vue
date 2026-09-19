<template>
  <UDashboardPanel id="location-collection">
    <template #header>
      <UDashboardNavbar :title="collection?.name ?? presentation.collectionLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="surfacePath" :label="presentation.collectionLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DashboardListEditor
        v-model:editing="editing"
        v-model:selected="selected"
        :title="collection?.name ?? presentation.collectionLabel"
        :description="`Customers see ${presentation.itemLabelPlural.toLowerCase()} in this order.`"
        :items="listItems"
        :pending="pending"
        :error="loadError"
        :empty-title="`No ${presentation.itemLabelPlural.toLowerCase()} here yet`"
        empty-icon="i-lucide-utensils"
        :add-label="`Add a ${presentation.itemLabel.toLowerCase()}`"
        reorderable
        selectable
        @add="openNew"
        @open="openExisting"
        @move="moveProduct"
      >
        <template #selection-actions>
          <UButton label="Move" color="neutral" variant="soft" data-testid="product-move-open" @click="moveDialogOpen = true" />
        </template>

        <template #item="{ item }">
          <button type="button" class="flex w-full items-center gap-4 text-left" :data-testid="`product-${item.id}`" @click="openExisting(item)">
            <DashboardMediaThumb :asset="item.row.image" :label="item.row.name" fallback-icon="i-lucide-image" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</span>
              <span class="mt-1 block text-sm tabular-nums" :class="priceLabel(item.row) ? 'text-muted' : 'italic text-muted'">
                {{ priceLabel(item.row) || 'No price set' }}
              </span>
            </span>
          </button>
        </template>
      </DashboardListEditor>

      <!-- Move is its own action, exactly as it is on Airbnb: it changes which
           category items belong to, never their order inside one. -->
      <DashboardListItemDialog
        v-model:open="moveDialogOpen"
        :title="`Move ${selected.length === 1 ? presentation.itemLabel.toLowerCase() : `${selected.length} ${presentation.itemLabelPlural.toLowerCase()}`}`"
        :removable="false"
        :saving="moving"
        :save-disabled="!moveTargetId"
        save-label="Move"
        :error="moveError"
        @save="moveSelected"
      >
        <UFormField :label="`Choose a ${presentation.collectionGroupLabel.toLowerCase()}`">
          <div class="space-y-2">
            <label
              v-for="option in moveTargets"
              :key="option.id"
              class="flex cursor-pointer items-center gap-3 rounded-lg border border-default px-3 py-2"
              :class="moveTargetId === option.id ? 'border-primary' : ''"
            >
              <input v-model="moveTargetId" type="radio" :value="option.id" :name="`move-target`">
              <span class="text-sm text-highlighted">{{ option.name }}</span>
            </label>
            <p v-if="!moveTargets.length" class="text-sm text-muted">
              There is nowhere else to move these yet. Add another {{ presentation.collectionGroupLabel.toLowerCase() }} first.
            </p>
          </div>
        </UFormField>
      </DashboardListItemDialog>
      <UAlert v-if="orderError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="orderError" class="mt-4" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
// One category's items. Rendered by `[categoryId].vue`, which owns the frame.
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardMediaThumb from '~/components/dashboard/DashboardMediaThumb.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import type { Product } from '~/server/types/products'
import { getErrorMessage } from '~/utils/errors'
import { formatProductMoney } from '~/utils/product-money'
import { selectPrice } from '~/shared/prices'
import { isCurrencyCode } from '~/shared/currencies'
import { collectionsOnSurface, isCatalogSurface, presentationForSurface, productSurfaceOf } from '~/utils/product-presentation'


const route = useRoute()
const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// The surface this collection is managed on owns the words: a collection of
// bookable products reads as experiences, a section of a menu as dishes.
const segment = String(route.params.surface ?? '')
if (!isCatalogSurface(vertical, segment)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const presentation = presentationForSurface(vertical, segment)
const collectionId = computed(() => String(route.params.collectionId ?? route.params.categoryId ?? ''))
const rawCurrency = dashboard.site.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency
const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const surfacePath = computed(() => `${locationPath.value}/products/${String(route.params.surface ?? '')}`)
const collectionPath = computed(() => `${surfacePath.value}/${collectionId.value}`)

const catalog = useLocationProductCatalog(siteId, locationId)
const collections = catalog.collections
const pending = catalog.pending

// Reorder is a mode: the local order stands while the edit state is open and
// commits once when it closes, so it is held apart from the shared catalog.
const localOrder = ref<Product[] | null>(null)
/**
 * This surface's products in this collection, in the order the merchant set.
 *
 * Position is on the membership row, so the same product can sit third here
 * and first in another collection without being copied. A collection holding
 * both dishes and a bookable omakase is one collection on two surfaces, and
 * each shows its own members — the same projection the public pages make.
 */
const products = computed(() => {
  if (localOrder.value) return localOrder.value
  const positions = new Map<string, number>()
  for (const product of catalog.products.value) {
    const membership = product.collections.find(entry => entry.collection_id === collectionId.value)
    if (membership) positions.set(product.id, membership.sort_order)
  }
  return catalog.products.value
    .filter(product => positions.has(product.id) && productSurfaceOf(vertical, product) === segment)
    .sort((left, right) => (positions.get(left.id)! - positions.get(right.id)!) || left.name.localeCompare(right.name))
})
/** Each collection with the products that are in it, which is what a surface is read from. */
const collectionsWithProducts = computed(() => {
  const members = new Map<string, Product[]>()
  for (const product of catalog.products.value) {
    for (const membership of product.collections) {
      members.set(membership.collection_id, [...(members.get(membership.collection_id) ?? []), product])
    }
  }
  return collections.value.map(row => ({ ...row, products: members.get(row.id) ?? [] }))
})

const editing = ref(false)
const selected = ref<string[]>([])
const orderDirty = ref(false)
const orderError = ref<string | null>(null)
const moveError = ref<string | null>(null)

// Reached through this surface, so it has to have a member on it. A collection
// with only bookable products opened under /menu would read as a menu section
// and offer menu targets to move them into. An empty collection is on every
// surface until it holds something.
const collection = computed(() =>
  collectionsOnSurface(vertical, collectionsWithProducts.value, segment).find(row => row.id === collectionId.value) ?? null)
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${presentation.itemLabelPlural.toLowerCase()}`) : null))
const listItems = computed(() => products.value.map(row => ({ id: row.id, title: row.name, row })))
// Somewhere else on this surface: moving a dish into a collection of bookable
// experiences would file it where customers never read dishes.
const moveTargets = computed(() =>
  collectionsOnSurface(vertical, collectionsWithProducts.value, segment)
    .filter(row => row.id !== collectionId.value))

useSeoMeta({ title: () => `${collection.value?.name ?? presentation.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

/** The offer this location shows, resolved through the one selection contract. */
function priceLabel(product: Product) {
  const selection = { currency, location_id: locationId.value, at: new Date().toISOString() }
  const offers = product.variants.flatMap(variant => selectPrice(variant.prices, selection) ?? [])
  const lowest = offers.reduce<typeof offers[number] | null>((best, offer) => (!best || offer.unit_amount < best.unit_amount ? offer : best), null)
  return formatProductMoney(lowest)
}

const load = catalog.refresh

// A category that is not in the catalog is not a page. Thrown from an effect it
// would be an unhandled rejection rather than the 404 screen, so it is shown.
watchEffect(() => {
  if (!catalog.pending.value && catalog.collections.value.length && !collection.value) {
    showError(createError({ statusCode: 404, statusMessage: `${presentation.collectionGroupLabel} not found` }))
  }
})

/** Local while the edit state is open; committed once when it closes. */
function moveProduct(item: { row: Product }, direction: -1 | 1) {
  const index = products.value.findIndex(row => row.id === item.row.id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= products.value.length) return
  const next = [...products.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  localOrder.value = next
  orderDirty.value = true
}

/**
 * Save the pending order and return the order this collection now has.
 *
 * The caller needs that list: once the local order is cleared, `products`
 * recomputes from a catalog that has not been refetched, so it reads back the
 * order from before the reorder. A caller that then sent it as definitive
 * silently undid what the merchant had just arranged. Null means the save
 * failed and the list was reloaded.
 */
async function commitOrder(): Promise<string[] | null> {
  const id = locationId.value
  const order = products.value.map(row => row.id)
  if (!id || !orderDirty.value) return order
  orderDirty.value = false
  localOrder.value = null
  orderError.value = null
  try {
    // The complete intended membership and order for this collection.
    await dashboardApi(`/api/editor/sites/${siteId}/collections/${collectionId.value}/products`, {
      method: 'PUT',
      body: { product_ids: order },
      validate: isRecord,
    })
  } catch (error) {
    orderError.value = getErrorMessage(error, 'Failed to save the new order')
    await load()
    return null
  }
  return order
}

watch(editing, (value, previous) => {
  if (previous && !value) void commitOrder()
})

const moveDialogOpen = ref(false)
const moveTargetId = ref('')
const moving = ref(false)

watch(moveDialogOpen, (open) => {
  if (open) {
    moveTargetId.value = ''
    moveError.value = null
  }
})

async function moveSelected() {
  const id = locationId.value
  if (!id || !moveTargetId.value || !selected.value.length) return
  moving.value = true
  moveError.value = null
  try {
    // Commit any pending reorder first. Closing the edit state below would
    // otherwise fire commitOrder with the pre-move list, sending IDs that no
    // longer belong to this category.
    const committed = await commitOrder()
    if (!committed) return
    // Moving is a membership change: the products leave this collection and
    // join the target, and each collection's order is sent whole.
    const remaining = committed.filter(productId => !selected.value.includes(productId))
    const targetPositions = new Map<string, number>()
    for (const product of catalog.products.value) {
      const membership = product.collections.find(entry => entry.collection_id === moveTargetId.value)
      if (membership) targetPositions.set(product.id, membership.sort_order)
    }
    const targetOrder = [...targetPositions.keys()]
      .sort((left, right) => targetPositions.get(left)! - targetPositions.get(right)!)
      .concat(selected.value.filter(id => !targetPositions.has(id)))
    await dashboardApi(`/api/editor/sites/${siteId}/collections/${collectionId.value}/products`, {
      method: 'PUT', body: { product_ids: remaining }, validate: isRecord,
    })
    await dashboardApi(`/api/editor/sites/${siteId}/collections/${moveTargetId.value}/products`, {
      method: 'PUT', body: { product_ids: targetOrder }, validate: isRecord,
    })
    moveDialogOpen.value = false
    selected.value = []
    editing.value = false
    await load()
  } catch (error) {
    moveError.value = getErrorMessage(error, `Failed to move ${presentation.itemLabelPlural.toLowerCase()}`)
  } finally {
    moving.value = false
  }
}


/** Adding opens the item's own level, the same screen editing uses. */
function openNew() {
  void navigateTo(`${collectionPath.value}/new`)
}


/** An item is its own screen now, so opening one is navigation, not a sheet. */
function openExisting(item: { row: Product }) {
  return navigateTo(`${collectionPath.value}/${item.row.id}`)
}

watch([locationId, collectionId], () => {
  orderDirty.value = false
  localOrder.value = null
  editing.value = false
  moveDialogOpen.value = false
  selected.value = []
  void load()
}, { immediate: true })

</script>

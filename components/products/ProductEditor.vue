<template>
  <UDashboardPanel id="product-editor" class="min-w-0 bg-default" :ui="{ root: 'h-full min-h-0', body: 'min-h-0 overflow-y-auto p-0' }">
    <template #header>
      <UDashboardNavbar :toggle="false" :title="mobileTitle" class="bg-default lg:hidden" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UButton
            v-if="routeLocation.kind !== 'collection'"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            square
            :aria-label="`Back to ${presentation.collectionLabel.toLowerCase()}`"
            @click="returnToCollection"
          />
          <DashboardNavbarLeading v-else />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loadState === 'loading'" class="mx-auto w-full max-w-3xl space-y-5 px-5 py-8 sm:px-8" aria-label="Loading products">
        <USkeleton class="h-10 w-52" />
        <USkeleton v-for="index in 3" :key="index" class="h-36 rounded-2xl" />
      </div>

      <div v-else-if="loadState === 'failed'" class="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
        <UAlert color="error" variant="soft" :title="`${presentation.collectionLabel} could not be loaded`" :description="loadError || 'Try again.'">
          <template #actions>
            <UButton color="error" variant="soft" label="Retry" @click="loadProducts" />
          </template>
        </UAlert>
      </div>

      <EditorPaneShell v-else :has-detail="routeLocation.kind !== 'collection'">
        <template #index>
          <div class="mb-7 flex items-center justify-between gap-4">
            <div class="hidden min-w-0 lg:block">
              <h1 class="truncate text-2xl font-bold tracking-tight text-highlighted">{{ presentation.collectionLabel }}</h1>
              <p class="mt-1 text-sm text-muted">{{ locationTitle }}</p>
            </div>
            <UButton ref="addButton" class="ml-auto rounded-full" icon="i-lucide-plus" :label="`Add ${presentation.itemLabel}`" :disabled="busy" @click="startCreate" />
          </div>

          <UAlert v-if="collectionError" class="mb-5" color="error" variant="soft" title="Order could not be changed" :description="collectionError" />

          <div v-if="products.length === 0" class="rounded-[1.25rem] bg-white px-6 py-14 text-center shadow-sm dark:bg-white/[0.04]">
            <UIcon name="i-lucide-package-open" class="mx-auto size-8 text-muted" />
            <p class="mt-4 font-semibold text-highlighted">No {{ presentation.collectionLabel.toLowerCase() }} yet</p>
            <UButton class="mt-5" icon="i-lucide-plus" :label="`Add ${presentation.itemLabel}`" @click="startCreate" />
          </div>

          <ProductCollectionOutline
            v-else
            :groups="productGroups"
            :selected-id="selectedProduct?.id"
            :presentation="presentation"
            :reordering="operation.kind === 'reorder'"
            @select="openProduct"
            @move-category="moveCategory"
            @move-product="moveProduct"
          />
        </template>

        <template #detail>
          <ProductReadView
            v-if="selectedProduct"
            :product="selectedProduct"
            :site-id="siteId"
            :location-id="locationId"
            :currency="currency"
            :presentation="presentation"
            :busy="busy"
            :media-error="mediaError"
            @edit="openField"
            @set-image="setPrimaryImage"
            @delete="requestDelete"
          />

          <div v-else-if="routeLocation.kind === 'create' || (routeLocation.kind === 'field' && routeLocation.productId === 'new')" class="mx-auto max-w-2xl">
            <div class="mb-8 hidden lg:block">
              <h2 class="text-4xl font-bold tracking-tight text-highlighted">New {{ presentation.itemLabel }}</h2>
            </div>
            <UAlert v-if="createError" class="mb-5" color="error" variant="soft" :title="`${presentation.itemLabel} could not be created`" :description="createError" />
            <section class="divide-y divide-default border-y border-default" :aria-label="`New ${presentation.itemLabel} details`">
              <button
                v-for="field in createFields"
                :key="field.id"
                type="button"
                class="block w-full py-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :aria-label="`Edit ${field.label}`"
                :disabled="busy"
                @click="openField(field.id, $event.currentTarget)"
              >
                <span class="block text-sm font-semibold text-muted">{{ field.label }}</span>
                <span class="mt-2 block break-words text-lg leading-7 text-highlighted">{{ field.value || 'Not set' }}</span>
              </button>
            </section>
            <div class="flex items-center justify-between gap-3 py-8 pb-24 lg:pb-8">
              <UButton color="neutral" variant="ghost" label="Cancel" :disabled="busy" @click="cancelCreate" />
              <UButton :label="`Create ${presentation.itemLabel}`" :loading="operation.kind === 'create'" :disabled="busy" @click="createProduct" />
            </div>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <EditorFocusedField
    :open="routeLocation.kind === 'field'"
    :title="focusedFieldLabel"
    :saving="operation.kind === 'save-field'"
    :save-disabled="!fieldDraft"
    :error="fieldError"
    @close="closeFocusedField"
    @cancel="cancelFocusedField"
    @save="saveFocusedField"
    @restore-focus="restoreFieldFocus"
  >
    <ProductFieldEditor
      v-if="fieldDraft"
      :draft="fieldDraft"
      :label="focusedFieldLabel"
      :disabled="operation.kind === 'save-field'"
      :validation-error="fieldValidationError"
      @update="updateFieldDraft"
    />
  </EditorFocusedField>

  <UModal v-model:open="deleteOpen" :dismissible="operation.kind !== 'delete'" :title="`Delete ${presentation.itemLabel.toLowerCase()}`" :ui="{ content: 'max-w-md' }">
    <template #body>
      <p class="text-sm text-toned">Delete <strong class="text-highlighted">{{ selectedProduct?.name }}</strong>? This cannot be undone.</p>
      <UAlert v-if="deleteError" class="mt-4" color="error" variant="soft" title="Could not delete" :description="deleteError" />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3 pb-[env(safe-area-inset-bottom)]">
        <UButton color="neutral" variant="ghost" label="Cancel" :disabled="operation.kind === 'delete'" @click="cancelDelete" />
        <UButton color="error" label="Delete" :loading="operation.kind === 'delete'" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type LocationQueryRaw } from 'vue-router'
import EditorFocusedField from '~/components/dashboard/EditorFocusedField.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import ProductCollectionOutline from '~/components/products/ProductCollectionOutline.vue'
import ProductFieldEditor, { type ProductFieldDraft, type ProductFieldId } from '~/components/products/ProductFieldEditor.vue'
import ProductReadView from '~/components/products/ProductReadView.vue'
import type { Product, ProductDetail, ProductPresentation } from '~/server/types/products'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { formatMinorAmount, majorAmountToMinor, minorAmountToMajor, PRICE_TAX_BEHAVIORS, PRICE_UNITS } from '~/shared/prices'

const props = defineProps<{ siteId: string, locationId: string, locationTitle: string, currency: CurrencyCode, presentation: ProductPresentation }>()

type ProductRouteLocation =
  | { kind: 'collection' }
  | { kind: 'create' }
  | { kind: 'item', productId: string }
  | { kind: 'field', productId: string, field: ProductFieldId }
type ProductOperation =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'save-field', productId: string, field: ProductFieldId }
  | { kind: 'reorder', target: string }
  | { kind: 'media', productId: string }
  | { kind: 'delete', productId: string }
interface NewProductDraft { name: string, category: string, price: string }

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const products = ref<Product[]>([])
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
const loadError = ref<string | null>(null)
const collectionError = ref<string | null>(null)
const fieldError = ref<string | null>(null)
const fieldValidationError = ref<string | null>(null)
const mediaError = ref<string | null>(null)
const createError = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const operation = ref<ProductOperation>({ kind: 'idle' })
const fieldDraft = ref<ProductFieldDraft | null>(null)
const initialFieldSnapshot = ref('')
const fieldTrigger = ref<HTMLElement | null>(null)
const returnProductId = ref<string | null>(null)
const reorderTrigger = ref<HTMLElement | null>(null)
const deleteTrigger = ref<HTMLElement | null>(null)
const addButton = ref<{ $el?: HTMLElement } | null>(null)
const deleteOpen = ref(false)
const allowFieldExit = ref(false)
const allowCreateExit = ref(false)
const emptyCreateDraft = (): NewProductDraft => ({ name: '', category: '', price: '' })
const newProductDraft = ref<NewProductDraft>(emptyCreateDraft())
const endpoint = `/api/editor/sites/${props.siteId}/locations/${props.locationId}/products`

const busy = computed(() => operation.value.kind !== 'idle')
const productGroups = computed(() => {
  const groups = new Map<string, Product[]>()
  for (const product of products.value) {
    const group = groups.get(product.category) ?? []
    group.push(product)
    groups.set(product.category, group)
  }
  return [...groups].map(([category, groupedProducts]) => ({ category, products: groupedProducts }))
})
const requestedProductId = computed(() => singleQueryValue(route.query.product))
const requestedFieldId = computed(() => parseFieldId(route.query.field))
const routeLocation = computed<ProductRouteLocation>(() => {
  if (loadState.value !== 'ready') return { kind: 'collection' }
  const productId = requestedProductId.value
  if (!productId) return { kind: 'collection' }
  if (productId === 'new') return requestedFieldId.value
    ? { kind: 'field', productId, field: requestedFieldId.value }
    : { kind: 'create' }
  if (!products.value.some(product => product.id === productId)) return { kind: 'collection' }
  return requestedFieldId.value
    ? { kind: 'field', productId, field: requestedFieldId.value }
    : { kind: 'item', productId }
})
const selectedProduct = computed(() => {
  const location = routeLocation.value
  return location.kind === 'item' || (location.kind === 'field' && location.productId !== 'new')
    ? products.value.find(product => product.id === location.productId) ?? null
    : null
})
const priceCurrency = computed(() => selectedProduct.value?.price?.currency ?? props.currency)
const mobileTitle = computed(() => {
  const location = routeLocation.value
  if (location.kind === 'create' || (location.kind === 'field' && location.productId === 'new')) return `New ${props.presentation.itemLabel}`
  if (selectedProduct.value) return selectedProduct.value.name
  return props.presentation.collectionLabel
})
const focusedFieldLabel = computed(() => fieldLabel(routeLocation.value.kind === 'field' ? routeLocation.value.field : null))
const fieldDraftDirty = computed(() => fieldDraft.value !== null && JSON.stringify(fieldDraft.value) !== initialFieldSnapshot.value)
const createDirty = computed(() => JSON.stringify(newProductDraft.value) !== JSON.stringify(emptyCreateDraft()))
const createFields = computed(() => [
  { id: 'name' as const, label: 'Name', value: newProductDraft.value.name },
  { id: 'category' as const, label: props.presentation.categoryLabel, value: newProductDraft.value.category },
  { id: 'price' as const, label: `Price (${props.currency})`, value: newProductDraft.value.price ? formatDraftPrice(newProductDraft.value.price) : '' },
])

function singleQueryValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseFieldId(value: unknown): ProductFieldId | null {
  return typeof value === 'string' && ['name', 'category', 'price', 'description', 'order-url', 'tags', 'details', 'status'].includes(value)
    ? value as ProductFieldId
    : null
}

function isPrice(value: unknown): boolean {
  return isRecord(value)
    && Number.isSafeInteger(value.amount_minor)
    && Number(value.amount_minor) >= 0
    && isCurrencyCode(value.currency)
    && typeof value.unit === 'string'
    && (PRICE_UNITS as readonly string[]).includes(value.unit)
    && typeof value.tax_behavior === 'string'
    && (PRICE_TAX_BEHAVIORS as readonly string[]).includes(value.tax_behavior)
    && (value.compare_at_amount_minor === null || Number.isSafeInteger(value.compare_at_amount_minor))
}

function isResolvedMediaAsset(value: unknown): boolean {
  return isRecord(value)
    && typeof value.asset_id === 'string'
    && typeof value.public_url === 'string'
    && (value.thumbnail_url === null || typeof value.thumbnail_url === 'string')
    && (value.alt_text === null || typeof value.alt_text === 'string')
}

function isProduct(value: unknown): value is Product {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.location_id === 'string'
    && typeof value.name === 'string'
    && typeof value.category === 'string'
    && typeof value.description === 'string'
    && (value.price === null || isPrice(value.price))
    && typeof value.is_visible === 'boolean'
    && typeof value.available === 'boolean'
    && typeof value.featured === 'boolean'
    && Number.isSafeInteger(value.sort_order)
    && Array.isArray(value.tags)
    && value.tags.every(tag => typeof tag === 'string')
    && Array.isArray(value.details)
    && Array.isArray(value.gallery)
    && value.gallery.every(isResolvedMediaAsset)
    && (value.image === null || isResolvedMediaAsset(value.image))
}

const isList = (value: unknown): value is { success: true, products: Product[] } => isRecord(value) && value.success === true && Array.isArray(value.products) && value.products.every(isProduct)
const isOne = (value: unknown): value is { success: true, product: Product } => isRecord(value) && value.success === true && isProduct(value.product)
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

async function fetchProducts(): Promise<Product[]> {
  return (await dashboardApi(endpoint, { validate: isList })).products
}

async function loadProducts() {
  loadState.value = 'loading'
  loadError.value = null
  try {
    products.value = await fetchProducts()
    loadState.value = 'ready'
  } catch (cause) {
    loadError.value = errorMessage(cause, `Failed to load ${props.presentation.collectionLabel}`)
    loadState.value = 'failed'
  }
}

function openProduct(productId: string, _trigger: EventTarget | null) {
  returnProductId.value = productId
  const query: LocationQueryRaw = { ...route.query, product: productId }
  delete query.field
  void router.push({ query })
}

function startCreate() {
  returnProductId.value = null
  newProductDraft.value = emptyCreateDraft()
  createError.value = null
  const query: LocationQueryRaw = { ...route.query, product: 'new' }
  delete query.field
  void router.push({ query })
}

function openField(field: ProductFieldId, trigger: EventTarget | null) {
  const location = routeLocation.value
  const productId = location.kind === 'create' ? 'new' : location.kind === 'item' ? location.productId : null
  if (!productId) return
  if (trigger instanceof HTMLElement) fieldTrigger.value = trigger
  void router.push({ query: { ...route.query, product: productId, field } })
}

function returnToCollection() {
  const query: LocationQueryRaw = { ...route.query }
  delete query.product
  delete query.field
  if (previousRouteMatches(previous => !previous.has('product'))) void router.back()
  else void router.replace({ query })
}

function closeFocusedField() {
  if (!busy.value) leaveFocusedField()
}

function cancelFocusedField() {
  if (busy.value) return
  allowFieldExit.value = true
  leaveFocusedField()
}

function leaveFocusedField() {
  const location = routeLocation.value
  if (location.kind !== 'field') return
  const query: LocationQueryRaw = { ...route.query }
  delete query.field
  if (previousRouteMatches(params => params.get('product') === location.productId && !params.has('field'))) void router.back()
  else void router.replace({ query })
}

function previousRouteMatches(predicate: (_params: URLSearchParams) => boolean): boolean {
  if (!import.meta.client) return false
  const previousUrl = window.history.state?.back
  if (typeof previousUrl !== 'string') return false
  const previous = new URL(previousUrl, window.location.href)
  return previous.pathname === route.path && predicate(previous.searchParams)
}

function restoreFieldFocus() {
  void nextTick(() => fieldTrigger.value?.focus())
}

function restoreCollectionFocus() {
  void nextTick(() => {
    const card = returnProductId.value
      ? [...document.querySelectorAll<HTMLElement>('[data-editor-item-id]')].find(element => element.dataset.editorItemId === returnProductId.value)
      : null
    const fallback = addButton.value?.$el
    if (card) card.focus()
    else if (fallback instanceof HTMLElement) fallback.focus()
  })
}

function createFieldDraft(location: Extract<ProductRouteLocation, { kind: 'field' }>): ProductFieldDraft | null {
  if (location.productId === 'new') {
    if (location.field === 'price') {
      return { kind: 'price', value: newProductDraft.value.price, currency: props.currency }
    }
    if (location.field === 'name' || location.field === 'category') {
      return { kind: location.field, value: newProductDraft.value[location.field] }
    }
    return null
  }
  const product = products.value.find(candidate => candidate.id === location.productId)
  if (!product) return null
  switch (location.field) {
    case 'name': return { kind: 'name', value: product.name }
    case 'category': return { kind: 'category', value: product.category }
    case 'price': return {
      kind: 'price',
      value: product.price ? minorAmountToMajor(product.price.amount_minor, product.price.currency) : '',
      currency: product.price?.currency ?? props.currency,
    }
    case 'description': return { kind: 'description', value: product.description }
    case 'order-url': return { kind: 'order-url', value: product.order_url ?? '' }
    case 'tags': return { kind: 'tags', value: product.tags.join(', ') }
    case 'details': return { kind: 'details', value: JSON.stringify(product.details, null, 2) }
    case 'status': return { kind: 'status', available: product.available, isVisible: product.is_visible, featured: product.featured }
  }
}

function updateFieldDraft(draft: ProductFieldDraft) {
  fieldDraft.value = draft
  fieldValidationError.value = null
}

function fieldLabel(field: ProductFieldId | null): string {
  if (field === 'category') return props.presentation.categoryLabel
  if (field === 'price') return `Price (${priceCurrency.value})`
  if (field === 'order-url') return 'Order URL'
  if (field === 'status') return 'Availability and visibility'
  if (!field) return props.presentation.itemLabel
  return field[0]!.toUpperCase() + field.slice(1)
}

function updateForDraft(draft: ProductFieldDraft, product: Product | null): Record<string, unknown> {
  if (draft.kind === 'status') return { available: draft.available, is_visible: draft.isVisible, featured: draft.featured }
  const value = draft.value
  if (draft.kind === 'name' || draft.kind === 'category') {
    const trimmed = value.trim()
    if (!trimmed) throw new Error(`${fieldLabel(draft.kind)} is required.`)
    return { [draft.kind]: trimmed }
  }
  if (draft.kind === 'price') {
    const currentPrice = product?.price
    return {
      price: {
        amount_minor: majorAmountToMinor(value, draft.currency),
        currency: draft.currency,
        unit: currentPrice?.unit ?? 'item',
        tax_behavior: currentPrice?.tax_behavior ?? 'unspecified',
        compare_at_amount_minor: currentPrice?.compare_at_amount_minor ?? null,
        valid_until: currentPrice?.valid_until ?? null,
      },
    }
  }
  if (draft.kind === 'description') return { description: value }
  if (draft.kind === 'order-url') {
    if (!value.trim()) return { order_url: null }
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Order URL must be an HTTPS address without credentials.')
    return { order_url: value.trim() }
  }
  if (draft.kind === 'tags') return { tags: value.split(',').map(tag => tag.trim()).filter(Boolean) }
  const details = JSON.parse(value) as unknown
  if (!Array.isArray(details)) throw new Error('Details must be a JSON array.')
  return { details: details as ProductDetail[] }
}

async function saveFocusedField() {
  const location = routeLocation.value
  const draft = fieldDraft.value
  if (location.kind !== 'field' || !draft || busy.value) return
  fieldError.value = null
  fieldValidationError.value = null
  let update: Record<string, unknown>
  try {
    const product = location.productId === 'new'
      ? null
      : products.value.find(candidate => candidate.id === location.productId) ?? null
    update = updateForDraft(draft, product)
  } catch (cause) {
    fieldValidationError.value = errorMessage(cause, 'Check this field.')
    return
  }
  if (location.productId === 'new') {
    if (draft.kind !== 'name' && draft.kind !== 'category' && draft.kind !== 'price') return
    newProductDraft.value = { ...newProductDraft.value, [draft.kind]: draft.value }
    allowFieldExit.value = true
    leaveFocusedField()
    return
  }
  operation.value = { kind: 'save-field', productId: location.productId, field: location.field }
  try {
    const response = await dashboardApi(`${endpoint}/${location.productId}`, { method: 'PATCH', body: update, validate: isOne })
    replaceProduct(response.product)
    allowFieldExit.value = true
    leaveFocusedField()
  } catch (cause) {
    fieldError.value = errorMessage(cause, `Failed to save ${fieldLabel(location.field).toLowerCase()}`)
  } finally {
    operation.value = { kind: 'idle' }
  }
}

async function createProduct() {
  if (busy.value) return
  createError.value = null
  const name = newProductDraft.value.name.trim()
  const category = newProductDraft.value.category.trim()
  if (!name || !category || !newProductDraft.value.price) {
    createError.value = `Add a name, ${props.presentation.categoryLabel.toLowerCase()}, and price before creating this ${props.presentation.itemLabel.toLowerCase()}.`
    return
  }
  let amountMinor: number
  try {
    amountMinor = majorAmountToMinor(newProductDraft.value.price, props.currency)
  } catch (cause) {
    createError.value = errorMessage(cause, 'Enter a valid price.')
    return
  }
  operation.value = { kind: 'create' }
  try {
    const response = await dashboardApi(endpoint, {
      method: 'POST',
      body: { name, category, price: { amount_minor: amountMinor, currency: props.currency, unit: 'item', tax_behavior: 'unspecified' } },
      validate: isOne,
    })
    products.value = [...products.value, response.product].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
    newProductDraft.value = emptyCreateDraft()
    allowCreateExit.value = true
    const query: LocationQueryRaw = { ...route.query, product: response.product.id }
    delete query.field
    await router.replace({ query })
  } catch (cause) {
    createError.value = errorMessage(cause, `Failed to create ${props.presentation.itemLabel}`)
  } finally {
    operation.value = { kind: 'idle' }
  }
}

function cancelCreate() {
  allowCreateExit.value = true
  newProductDraft.value = emptyCreateDraft()
  returnToCollection()
}

function replaceProduct(product: Product) {
  const index = products.value.findIndex(candidate => candidate.id === product.id)
  if (index >= 0) products.value.splice(index, 1, product)
}

async function moveCategory(categoryIndex: number, direction: -1 | 1, trigger: EventTarget | null) {
  const group = productGroups.value[categoryIndex]
  if (!group || busy.value) return
  const beforeCategory = direction === -1
    ? productGroups.value[categoryIndex - 1]?.category ?? null
    : productGroups.value[categoryIndex + 2]?.category ?? null
  if (trigger instanceof HTMLElement) reorderTrigger.value = trigger
  operation.value = { kind: 'reorder', target: group.category }
  collectionError.value = null
  try {
    await dashboardApi(`${endpoint}/categories/move`, { method: 'POST', body: { category: group.category, before_category: beforeCategory }, validate: isSuccess })
    products.value = await fetchProducts()
  } catch (cause) {
    collectionError.value = errorMessage(cause, `Failed to move ${props.presentation.categoryLabel}`)
  } finally {
    operation.value = { kind: 'idle' }
    void nextTick(() => reorderTrigger.value?.focus())
  }
}

async function moveProduct(categoryIndex: number, productIndex: number, direction: -1 | 1, trigger: EventTarget | null) {
  const group = productGroups.value[categoryIndex]
  const product = group?.products[productIndex]
  if (!group || !product || busy.value) return
  const beforeProductId = direction === -1
    ? group.products[productIndex - 1]?.id ?? null
    : group.products[productIndex + 2]?.id ?? productGroups.value[categoryIndex + 1]?.products[0]?.id ?? null
  if (trigger instanceof HTMLElement) reorderTrigger.value = trigger
  operation.value = { kind: 'reorder', target: product.id }
  collectionError.value = null
  try {
    await dashboardApi(`${endpoint}/move`, { method: 'POST', body: { product_ids: [product.id], before_product_id: beforeProductId }, validate: isSuccess })
    products.value = await fetchProducts()
  } catch (cause) {
    collectionError.value = errorMessage(cause, `Failed to move ${props.presentation.itemLabel}`)
  } finally {
    operation.value = { kind: 'idle' }
    void nextTick(() => reorderTrigger.value?.focus())
  }
}

async function setPrimaryImage(assetId: string | null) {
  const product = selectedProduct.value
  if (!product || busy.value) return
  operation.value = { kind: 'media', productId: product.id }
  mediaError.value = null
  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements`, {
      method: 'PUT',
      body: { placement: { owner_type: 'product', owner_id: product.id, slot: 'image' }, asset_id: assetId },
      validate: value => isRecord(value),
    })
    products.value = await fetchProducts()
  } catch (cause) {
    mediaError.value = errorMessage(cause, 'Failed to update primary image')
  } finally {
    operation.value = { kind: 'idle' }
  }
}

function requestDelete(trigger: EventTarget | null) {
  if (trigger instanceof HTMLElement) deleteTrigger.value = trigger
  deleteError.value = null
  deleteOpen.value = true
}

function cancelDelete() {
  deleteOpen.value = false
  void nextTick(() => deleteTrigger.value?.focus())
}

async function confirmDelete() {
  const product = selectedProduct.value
  if (!product || busy.value) return
  operation.value = { kind: 'delete', productId: product.id }
  deleteError.value = null
  try {
    await dashboardApi(`${endpoint}/${product.id}`, { method: 'DELETE', validate: isSuccess })
    products.value = products.value.filter(candidate => candidate.id !== product.id)
    deleteOpen.value = false
    const query: LocationQueryRaw = { ...route.query }
    delete query.product
    delete query.field
    await router.replace({ query })
  } catch (cause) {
    deleteError.value = errorMessage(cause, `Failed to delete ${props.presentation.itemLabel}`)
  } finally {
    operation.value = { kind: 'idle' }
  }
}

function formatDraftPrice(value: string): string {
  try {
    return formatMinorAmount(majorAmountToMinor(value, props.currency), props.currency)
  } catch {
    return value
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

function normalizeRouteQuery() {
  if (loadState.value !== 'ready') return
  const productId = requestedProductId.value
  const rawField = singleQueryValue(route.query.field)
  const productIsValid = productId === 'new' || (productId !== null && products.value.some(product => product.id === productId))
  const fieldIsValid = rawField === null || (requestedFieldId.value !== null && (productId !== 'new' || ['name', 'category', 'price'].includes(requestedFieldId.value)))
  if ((!productId && rawField === null) || (productIsValid && fieldIsValid)) return
  const query: LocationQueryRaw = { ...route.query }
  if (!productIsValid) delete query.product
  if (!productIsValid || !fieldIsValid || !productId) delete query.field
  void router.replace({ query })
}

watch([loadState, requestedProductId, () => route.query.field, products], normalizeRouteQuery, { deep: true })
watch(routeLocation, (location) => {
  fieldError.value = null
  fieldValidationError.value = null
  if (location.kind === 'field') fieldDraft.value = createFieldDraft(location)
  else fieldDraft.value = null
  initialFieldSnapshot.value = JSON.stringify(fieldDraft.value)
  if (location.kind !== 'field') allowFieldExit.value = false
  if (location.kind !== 'create' && !(location.kind === 'field' && location.productId === 'new')) allowCreateExit.value = false
})
watch(routeLocation, (location, previous) => {
  if (location.kind === 'collection' && previous.kind !== 'collection') restoreCollectionFocus()
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!fieldDraftDirty.value && !(requestedProductId.value === 'new' && createDirty.value)) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteUpdate((to) => {
  const nextProduct = singleQueryValue(to.query.product)
  const nextField = singleQueryValue(to.query.field)
  if (routeLocation.value.kind === 'field' && nextField !== routeLocation.value.field && fieldDraftDirty.value && !allowFieldExit.value) {
    if (!window.confirm('Discard this field change?')) return false
  }
  if (requestedProductId.value === 'new' && nextProduct !== 'new' && createDirty.value && !allowCreateExit.value) {
    if (!window.confirm(`Discard this new ${props.presentation.itemLabel.toLowerCase()}?`)) return false
  }
})
onBeforeRouteLeave(() => {
  if (fieldDraftDirty.value && !allowFieldExit.value && !window.confirm('Discard this field change?')) return false
  if (requestedProductId.value === 'new' && createDirty.value && !allowCreateExit.value && !window.confirm(`Discard this new ${props.presentation.itemLabel.toLowerCase()}?`)) return false
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  void loadProducts()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>

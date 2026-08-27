<template>
  <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section>
      <div class="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">{{ presentation.collectionLabel }}</h1>
          <p class="mt-1 text-sm text-muted">Products for {{ locationTitle }}</p>
        </div>
        <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" type="button" @click="startCreate">Add {{ presentation.itemLabel }}</button>
      </div>
      <p v-if="error" role="alert" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
      <div v-if="loading" class="py-12 text-center text-sm text-muted">Loading Products…</div>
      <div v-else class="divide-y divide-default overflow-hidden rounded-xl border border-default">
        <button
          v-for="product in products"
          :key="product.id"
          type="button"
          class="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 p-4 text-left hover:bg-elevated"
          @click="editProduct(product)"
        >
          <img v-if="product.image?.public_url" :src="product.image.public_url" :alt="product.image.alt_text || product.name" class="size-12 rounded object-cover">
          <span v-else class="size-12 rounded bg-elevated" />
          <span class="min-w-0"><strong class="block truncate">{{ product.name }}</strong><span class="block truncate text-sm text-muted">{{ product.category }}</span></span>
          <span class="text-sm tabular-nums">{{ formatProductMoney(product.price_amount, currency) }}</span>
        </button>
        <p v-if="products.length === 0" class="p-8 text-center text-sm text-muted">No Products published for this location.</p>
      </div>
    </section>

    <form v-if="editing" class="space-y-4 rounded-xl border border-default p-5" @submit.prevent="save">
      <h2 class="font-semibold">{{ editing.id ? `Edit ${presentation.itemLabel}` : `New ${presentation.itemLabel}` }}</h2>
      <label class="block text-sm">Name<input v-model="editing.name" required maxlength="240" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
      <label class="block text-sm">{{ presentation.categoryLabel }}<input v-model="editing.category" required maxlength="120" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
      <label class="block text-sm">Price ({{ currency }})<input v-model="editing.price_amount" required inputmode="decimal" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
      <label class="block text-sm">Description<textarea v-model="editing.description" maxlength="10000" rows="4" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" /></label>
      <label class="block text-sm">Order URL<input v-model="editing.order_url" type="url" placeholder="https://…" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"><span v-if="orderHostname" class="mt-1 block text-xs text-muted">Destination: {{ orderHostname }}</span></label>
      <label class="block text-sm">Tags<input v-model="editing.tags_text" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" placeholder="tag one, tag two"></label>
      <label class="block text-sm">Details JSON<textarea v-model="editing.details_text" rows="5" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2 font-mono text-xs" /></label>
      <div v-if="editing.id">
        <p class="mb-1 text-sm">Primary image</p>
        <MediaPicker :site-id="siteId" :location-id="locationId" :model-value="editing.image_asset_id" accept="image" title="Product primary image" @update:model-value="setPrimaryImage" />
      </div>
      <div class="grid grid-cols-3 gap-3 text-sm">
        <label><input v-model="editing.is_visible" type="checkbox"> Visible</label>
        <label><input v-model="editing.available" type="checkbox"> Available</label>
        <label><input v-model="editing.featured" type="checkbox"> Featured</label>
      </div>
      <div class="flex gap-3">
        <button :disabled="saving" class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button class="rounded-lg border border-default px-4 py-2 text-sm" type="button" @click="editing = null">Cancel</button>
        <button v-if="editing.id" class="ml-auto text-sm text-red-600" type="button" @click="remove">Delete</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { Product, ProductDetail, ProductPresentation } from '~/server/types/products'
import type { CurrencyCode } from '~/shared/currencies'
import { formatProductMoney } from '~/utils/product-money'

const props = defineProps<{ siteId: string; locationId: string; locationTitle: string; currency: CurrencyCode; presentation: ProductPresentation }>()
interface EditingProduct { id: string | null; name: string; category: string; price_amount: string; description: string; order_url: string; tags_text: string; details_text: string; is_visible: boolean; available: boolean; featured: boolean; image_asset_id: string | null }
const products = ref<Product[]>([])
const editing = ref<EditingProduct | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const dashboardApi = useDashboardApi()
const isProduct = (value: unknown): value is Product => isRecord(value) && typeof value.id === 'string' && typeof value.location_id === 'string' && typeof value.name === 'string' && typeof value.category === 'string' && typeof value.price_amount === 'string' && Array.isArray(value.tags) && Array.isArray(value.details)
const isList = (value: unknown): value is { success: true; products: Product[] } => isRecord(value) && value.success === true && Array.isArray(value.products) && value.products.every(isProduct)
const isOne = (value: unknown): value is { success: true; product: Product } => isRecord(value) && value.success === true && isProduct(value.product)
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true
const endpoint = `/api/editor/sites/${props.siteId}/locations/${props.locationId}/products`
const orderHostname = computed(() => { try { return editing.value?.order_url ? new URL(editing.value.order_url).hostname : '' } catch { return '' } })

async function load() {
  loading.value = true
  try { products.value = (await dashboardApi(endpoint, { validate: isList })).products }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Failed to load Products' }
  finally { loading.value = false }
}
function startCreate() { editing.value = { id: null, name: '', category: '', price_amount: '', description: '', order_url: '', tags_text: '', details_text: '[]', is_visible: true, available: true, featured: false, image_asset_id: null } }
function editProduct(product: Product) { editing.value = { id: product.id, name: product.name, category: product.category, price_amount: product.price_amount, description: product.description, order_url: product.order_url ?? '', tags_text: product.tags.join(', '), details_text: JSON.stringify(product.details, null, 2), is_visible: product.is_visible, available: product.available, featured: product.featured, image_asset_id: product.image?.asset_id ?? null } }
function payload(product: EditingProduct) {
  let details: ProductDetail[]
  try { details = JSON.parse(product.details_text) as ProductDetail[] } catch { throw new Error('Details must be valid JSON') }
  return { name: product.name, category: product.category, price_amount: product.price_amount, description: product.description, order_url: product.order_url || null, tags: product.tags_text.split(',').map(tag => tag.trim()).filter(Boolean), details, is_visible: product.is_visible, available: product.available, featured: product.featured }
}
async function save() {
  const product = editing.value
  if (!product) return
  saving.value = true; error.value = null
  try {
    const response = product.id
      ? await dashboardApi(`${endpoint}/${product.id}`, { method: 'PATCH', body: payload(product), validate: isOne })
      : await dashboardApi(endpoint, { method: 'POST', body: payload(product), validate: isOne })
    await load()
    if (editing.value === product) editProduct(response.product)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Failed to save Product' }
  finally { saving.value = false }
}
async function remove() {
  if (!editing.value?.id) return
  error.value = null
  try {
    await dashboardApi(`${endpoint}/${editing.value.id}`, { method: 'DELETE', validate: isSuccess })
    editing.value = null
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to delete Product'
  }
}
async function setPrimaryImage(assetId: string | null) {
  const product = editing.value
  if (!product?.id) return
  error.value = null
  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/media/placements`, {
      method: 'PUT',
      body: {
        placement: { owner_type: 'product', owner_id: product.id, slot: 'image' },
        asset_id: assetId,
      },
      validate: value => isRecord(value),
    })
    if (editing.value === product) editing.value.image_asset_id = assetId
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Failed to update primary image'
  }
}
await load()
</script>

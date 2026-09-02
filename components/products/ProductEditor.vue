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
      <div v-else class="space-y-4">
        <section v-for="(group, categoryIndex) in productGroups" :key="group.category" class="overflow-hidden rounded-xl border border-default">
          <header class="flex items-center justify-between gap-3 border-b border-default bg-elevated px-4 py-3">
            <div>
              <h2 class="font-semibold text-highlighted">{{ group.category }}</h2>
              <p class="text-xs text-muted">{{ group.products.length }} {{ group.products.length === 1 ? 'item' : 'items' }}</p>
            </div>
            <div class="flex gap-1">
              <button type="button" class="rounded-md border border-default px-2 py-1 text-sm disabled:opacity-30" :aria-label="`Move ${group.category} up`" :disabled="reordering || categoryIndex === 0" @click="moveCategory(categoryIndex, -1)">↑</button>
              <button type="button" class="rounded-md border border-default px-2 py-1 text-sm disabled:opacity-30" :aria-label="`Move ${group.category} down`" :disabled="reordering || categoryIndex === productGroups.length - 1" @click="moveCategory(categoryIndex, 1)">↓</button>
            </div>
          </header>
          <div class="divide-y divide-default">
            <div v-for="(product, productIndex) in group.products" :key="product.id" class="grid grid-cols-[minmax(0,1fr)_auto] items-center">
              <button type="button" class="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 p-4 text-left hover:bg-elevated" @click="editProduct(product)">
                <img v-if="product.image?.public_url" :src="product.image.public_url" :alt="product.image.alt_text || product.name" class="size-12 rounded object-cover">
                <span v-else class="size-12 rounded bg-elevated" />
                <span class="min-w-0"><strong class="block truncate">{{ product.name }}</strong></span>
                <span class="text-sm tabular-nums">{{ formatProductMoney(product.price) }}</span>
              </button>
              <div class="mr-3 flex gap-1">
                <button type="button" class="rounded-md border border-default px-2 py-1 text-sm disabled:opacity-30" :aria-label="`Move ${product.name} up`" :disabled="reordering || productIndex === 0" @click="moveProduct(categoryIndex, productIndex, -1)">↑</button>
                <button type="button" class="rounded-md border border-default px-2 py-1 text-sm disabled:opacity-30" :aria-label="`Move ${product.name} down`" :disabled="reordering || productIndex === group.products.length - 1" @click="moveProduct(categoryIndex, productIndex, 1)">↓</button>
              </div>
            </div>
          </div>
        </section>
        <p v-if="products.length === 0" class="p-8 text-center text-sm text-muted">No Products published for this location.</p>
      </div>
    </section>

    <form v-if="editing" class="space-y-4 rounded-xl border border-default p-5" @submit.prevent="save">
      <div class="flex items-center justify-between gap-4">
        <h2 class="font-semibold">{{ editing.id ? `Edit ${presentation.itemLabel}` : `New ${presentation.itemLabel}` }}</h2>
        <select v-if="editing.id && localeOptions.length > 1" v-model="locale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
          <option v-for="option in localeOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </div>
      <p v-if="localeError" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ localeError }}</p>
      <template v-if="locale === 'en'">
        <label class="block text-sm">Name<input v-model="editing.name" required maxlength="240" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
        <label class="block text-sm">{{ presentation.categoryLabel }}<input v-model="editing.category" required maxlength="120" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
        <label class="block text-sm">Price ({{ currency }})<input v-model="editing.price_major" required inputmode="decimal" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
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
      </template>
      <template v-else>
        <p class="text-xs text-muted">Source (English): {{ editing.name }} / {{ editing.category }}</p>
        <label class="block text-sm">Name ({{ locale }})<input v-model="localizedFields.name" maxlength="240" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
        <label class="block text-sm">{{ presentation.categoryLabel }} ({{ locale }})<input v-model="localizedFields.category" maxlength="120" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
        <label class="block text-sm">Description ({{ locale }})<textarea v-model="localizedFields.description" maxlength="10000" rows="4" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" /></label>
        <label class="block text-sm">Tags ({{ locale }})<input v-model="localizedFields.tags_text" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" placeholder="tag one, tag two"></label>
        <label class="block text-sm">Details JSON ({{ locale }})<textarea v-model="localizedFields.details_text" rows="4" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2 font-mono text-xs" placeholder='[{"key":"spice","label":"Spice level","values":["Mild"]}]' /></label>
        <label class="block text-sm">SEO title ({{ locale }})<input v-model="localizedFields.seo_title" maxlength="240" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
        <label class="block text-sm">SEO description ({{ locale }})<textarea v-model="localizedFields.seo_description" maxlength="500" rows="2" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" /></label>
      </template>
      <div class="flex gap-3">
        <button :disabled="saving" class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{{ saving ? 'Saving…' : 'Save' }}</button>
        <button class="rounded-lg border border-default px-4 py-2 text-sm" type="button" @click="editing = null">Cancel</button>
        <button v-if="editing.id && locale === 'en'" class="ml-auto text-sm text-red-600" type="button" @click="remove">Delete</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { Product, ProductDetail, ProductPresentation } from '~/server/types/products'
import type { CurrencyCode } from '~/shared/currencies'
import { formatProductMoney } from '~/utils/product-money'
import { majorAmountToMinor, minorAmountToMajor } from '~/shared/prices'

const props = defineProps<{ siteId: string; locationId: string; locationSlug: string; locationTitle: string; currency: CurrencyCode; presentation: ProductPresentation; vertical: string }>()
interface EditingProduct { id: string | null; name: string; category: string; price_major: string; description: string; order_url: string; tags_text: string; details_text: string; is_visible: boolean; available: boolean; featured: boolean; image_asset_id: string | null }
const products = ref<Product[]>([])
const editing = ref<EditingProduct | null>(null)
const loading = ref(true)
const saving = ref(false)
const reordering = ref(false)
const error = ref<string | null>(null)
const dashboardApi = useDashboardApi()

// Field-level localization: the canonical record above stays English-only.
// A translated value for a locale lives in the shared resource_localizations
// store (server/utils/localization.ts) behind the same editor API used by
// the platform admin catalog and CMS pages editor.
const locale = ref('en')
const locales = ref<string[]>(['en'])
const localeOptions = computed(() => locales.value)
const localeError = ref<string | null>(null)
const localizedFields = ref({ name: '', category: '', description: '', tags_text: '', details_text: '', seo_title: '', seo_description: '' })
function isLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadLocales() {
  try {
    const response = await dashboardApi<{ languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> }>(
      `/api/editor/sites/${props.siteId}/locales`,
      { validate: isLocalesResponse },
    )
    locales.value = ['en', ...response.languages.filter(item => item.locale_status === 'published' && !item.is_source).map(item => item.locale)]
  } catch (cause) {
    locales.value = []
    localeError.value = cause instanceof Error ? cause.message : 'Failed to load site languages'
  }
}
function isLocalizationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}
async function loadLocalizedValues(productId: string, targetLocale: string) {
  localeError.value = null
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${props.siteId}/localization/product/${productId}/${encodeURIComponent(targetLocale)}`,
      { validate: isLocalizationResponse },
    )
    const values = response.localization.values
    localizedFields.value = {
      name: typeof values.name === 'string' ? values.name : '',
      category: typeof values.category === 'string' ? values.category : '',
      description: typeof values.description === 'string' ? values.description : '',
      tags_text: Array.isArray(values.tags_json) ? values.tags_json.join(', ') : '',
      details_text: Array.isArray(values.details_json) ? JSON.stringify(values.details_json, null, 2) : '',
      seo_title: typeof values.seo_title === 'string' ? values.seo_title : '',
      seo_description: typeof values.seo_description === 'string' ? values.seo_description : '',
    }
  } catch (cause) {
    // 404 just means no translation saved yet for this locale — start blank.
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) localeError.value = cause instanceof Error ? cause.message : 'Failed to load translation'
    localizedFields.value = { name: '', category: '', description: '', tags_text: '', details_text: '', seo_title: '', seo_description: '' }
  }
}
watch(locale, (value) => {
  if (editing.value?.id && value !== 'en') void loadLocalizedValues(editing.value.id, value)
})
const isProduct = (value: unknown): value is Product => isRecord(value) && typeof value.id === 'string' && typeof value.location_id === 'string' && typeof value.name === 'string' && typeof value.category === 'string' && (value.price === null || isRecord(value.price)) && Array.isArray(value.tags) && Array.isArray(value.details)
const isList = (value: unknown): value is { success: true; products: Product[] } => isRecord(value) && value.success === true && Array.isArray(value.products) && value.products.every(isProduct)
const isOne = (value: unknown): value is { success: true; product: Product } => isRecord(value) && value.success === true && isProduct(value.product)
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true
const endpoint = `/api/editor/sites/${props.siteId}/locations/${props.locationId}/products`
const orderHostname = computed(() => { try { return editing.value?.order_url ? new URL(editing.value.order_url).hostname : '' } catch { return '' } })
const productGroups = computed(() => {
  const groups = new Map<string, Product[]>()
  for (const product of products.value) {
    const group = groups.get(product.category) ?? []
    group.push(product)
    groups.set(product.category, group)
  }
  return [...groups].map(([category, groupedProducts]) => ({ category, products: groupedProducts }))
})

async function load() {
  loading.value = true
  try { products.value = (await dashboardApi(endpoint, { validate: isList })).products }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Failed to load Products' }
  finally { loading.value = false }
}
function startCreate() { locale.value = 'en'; editing.value = { id: null, name: '', category: '', price_major: '', description: '', order_url: '', tags_text: '', details_text: '[]', is_visible: true, available: true, featured: false, image_asset_id: null } }
function editProduct(product: Product) {
  locale.value = 'en'
  editing.value = { id: product.id, name: product.name, category: product.category, price_major: product.price ? minorAmountToMajor(product.price.amount_minor, product.price.currency) : '', description: product.description, order_url: product.order_url ?? '', tags_text: product.tags.join(', '), details_text: JSON.stringify(product.details, null, 2), is_visible: product.is_visible, available: product.available, featured: product.featured, image_asset_id: product.image?.asset_id ?? null }
}
const productFamily = computed(() => props.vertical === 'restaurant' ? 'menu' : 'products')
function payload(product: EditingProduct) {
  let details: ProductDetail[]
  try { details = JSON.parse(product.details_text) as ProductDetail[] } catch { throw new Error('Details must be valid JSON') }
  return { name: product.name, category: product.category, price: { amount_minor: majorAmountToMinor(product.price_major, props.currency), currency: props.currency, unit: 'item' as const, tax_behavior: 'unspecified' as const }, description: product.description, order_url: product.order_url || null, tags: product.tags_text.split(',').map(tag => tag.trim()).filter(Boolean), details, is_visible: product.is_visible, available: product.available, featured: product.featured }
}
async function saveLocalized() {
  const product = editing.value
  if (!product?.id) return
  saving.value = true; localeError.value = null
  try {
    let details_json: unknown
    if (localizedFields.value.details_text.trim()) {
      try { details_json = JSON.parse(localizedFields.value.details_text) }
      catch { throw new Error('Details JSON must be valid JSON') }
    }
    await dashboardApi(`/api/editor/sites/${props.siteId}/localization/product/${product.id}/${encodeURIComponent(locale.value)}`, {
      method: 'PUT',
      body: {
        values: {
          category: localizedFields.value.category,
          name: localizedFields.value.name,
          ...(localizedFields.value.description ? { description: localizedFields.value.description } : {}),
          ...(localizedFields.value.tags_text.trim() ? { tags_json: localizedFields.value.tags_text.split(',').map(tag => tag.trim()).filter(Boolean) } : {}),
          ...(details_json ? { details_json } : {}),
          ...(localizedFields.value.seo_title.trim() ? { seo_title: localizedFields.value.seo_title.trim() } : {}),
          ...(localizedFields.value.seo_description.trim() ? { seo_description: localizedFields.value.seo_description.trim() } : {}),
        },
        route_path: `/${locale.value}/locations/${props.locationSlug}/${productFamily.value}/${product.name ? slugForRoute(product) : ''}`,
      },
      validate: isRecord,
    })
  } catch (cause) { localeError.value = cause instanceof Error ? cause.message : 'Failed to save translation' }
  finally { saving.value = false }
}
function slugForRoute(product: EditingProduct): string {
  const source = products.value.find(item => item.id === product.id)
  return source?.slug ?? ''
}
async function save() {
  const product = editing.value
  if (!product) return
  if (locale.value !== 'en') return await saveLocalized()
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
async function moveCategory(categoryIndex: number, direction: -1 | 1) {
  const group = productGroups.value[categoryIndex]
  if (!group) return
  const beforeCategory = direction === -1
    ? productGroups.value[categoryIndex - 1]?.category ?? null
    : productGroups.value[categoryIndex + 2]?.category ?? null
  reordering.value = true
  error.value = null
  try {
    await dashboardApi(`${endpoint}/categories/move`, {
      method: 'POST',
      body: { category: group.category, before_category: beforeCategory },
      validate: isSuccess,
    })
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : `Failed to move ${props.presentation.categoryLabel}`
  } finally {
    reordering.value = false
  }
}
async function moveProduct(categoryIndex: number, productIndex: number, direction: -1 | 1) {
  const group = productGroups.value[categoryIndex]
  const product = group?.products[productIndex]
  if (!group || !product) return
  const beforeProductId = direction === -1
    ? group.products[productIndex - 1]?.id ?? null
    : group.products[productIndex + 2]?.id ?? productGroups.value[categoryIndex + 1]?.products[0]?.id ?? null
  reordering.value = true
  error.value = null
  try {
    await dashboardApi(`${endpoint}/move`, {
      method: 'POST',
      body: { product_ids: [product.id], before_product_id: beforeProductId },
      validate: isSuccess,
    })
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : `Failed to move ${props.presentation.itemLabel}`
  } finally {
    reordering.value = false
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
await Promise.all([load(), loadLocales()])
</script>

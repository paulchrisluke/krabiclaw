<template>
  <UDashboardPanel id="location-product-category">
    <template #header>
      <UDashboardNavbar :title="category?.name ?? presentation.collectionLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="productsPath" :label="presentation.collectionLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DashboardListEditor
        v-model:editing="editing"
        v-model:selected="selected"
        :title="category?.name ?? presentation.collectionLabel"
        :description="`Customers see ${presentation.itemLabel.toLowerCase()}s in this order.`"
        :items="listItems"
        :pending="pending"
        :error="loadError"
        :empty-title="`No ${presentation.itemLabel.toLowerCase()}s here yet`"
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
          <button type="button" class="block w-full text-left" :data-testid="`product-${item.id}`" @click="openExisting(item)">
            <p class="truncate text-sm font-semibold text-highlighted">{{ item.row.name }}</p>
            <p class="mt-1 text-sm tabular-nums" :class="priceLabel(item.row) ? 'text-muted' : 'italic text-muted'">
              {{ priceLabel(item.row) || 'No price set' }}
            </p>
          </button>
        </template>
      </DashboardListEditor>

      <!-- Move is its own action, exactly as it is on Airbnb: it changes which
           category items belong to, never their order inside one. -->
      <DashboardListItemDialog
        v-model:open="moveDialogOpen"
        :title="`Move ${selected.length === 1 ? presentation.itemLabel.toLowerCase() : `${selected.length} ${presentation.itemLabel.toLowerCase()}s`}`"
        :removable="false"
        :saving="moving"
        :save-disabled="!moveTargetId"
        save-label="Move"
        @save="moveSelected"
      >
        <UFormField :label="`Choose a ${presentation.categoryLabel.toLowerCase()}`">
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
              There is nowhere else to move these yet. Add another {{ presentation.categoryLabel.toLowerCase() }} first.
            </p>
          </div>
        </UFormField>
      </DashboardListItemDialog>

      <DashboardListItemDialog
        v-model:open="dialogOpen"
        :title="editingId ? `Edit ${presentation.itemLabel.toLowerCase()}` : `Add a ${presentation.itemLabel.toLowerCase()}`"
        :removable="Boolean(editingId)"
        :saving="saving"
        :removing="removing"
        :save-disabled="!form.name.trim() || Boolean(form.has_fixed_price && form.price_note.trim())"
        @save="locale === 'en' ? save() : saveLocalized()"
        @remove="removeEditing"
      >
        <UFormField v-if="editingId && translationLocales.length" label="Language">
          <select v-model="locale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
            <option value="en">en</option>
            <option v-for="option in translationLocales" :key="option" :value="option">{{ option }}</option>
          </select>
        </UFormField>

        <template v-if="locale === 'en'">
          <UFormField label="Name">
            <UInput v-model="form.name" autofocus class="w-full" />
          </UFormField>

          <!-- The category reads as a row you act on, not a field you retype,
               which is what stopped a typo from forking a new category. -->
          <UFormField v-if="editingId" :label="presentation.categoryLabel">
            <UButton
              :label="category?.name ?? ''"
              trailing-icon="i-lucide-chevron-right"
              color="neutral"
              variant="soft"
              block
              class="justify-between"
              data-testid="product-category-move"
              @click="moveOne"
            />
          </UFormField>

          <UFormField>
            <UCheckbox v-model="form.has_fixed_price" label="Fixed price" />
          </UFormField>
          <UFormField v-if="form.has_fixed_price" :label="`Price (${currency})`">
            <UInput v-model="form.price_major" inputmode="decimal" class="w-full" />
          </UFormField>
          <UFormField label="Price wording" :description="form.has_fixed_price ? undefined : 'Shown instead of a number. Leave blank to show no price.'">
            <UInput v-model="form.price_note" placeholder="Market price" class="w-full" />
            <p v-if="form.has_fixed_price && form.price_note.trim()" class="mt-1 text-xs text-error">
              Clear this wording before saving a fixed price.
            </p>
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="form.description" :rows="4" class="w-full" />
          </UFormField>
          <UFormField label="Order URL">
            <UInput v-model="form.order_url" type="url" placeholder="https://…" class="w-full" />
          </UFormField>
          <UFormField label="Tags">
            <UInput v-model="form.tags_text" placeholder="tag one, tag two" class="w-full" />
          </UFormField>

          <UFormField v-if="editingId && locationId" label="Photo">
            <MediaPicker
              :site-id="siteId"
              :location-id="locationId"
              :model-value="form.image_asset_id"
              accept="image"
              title="Product primary image"
              @update:model-value="setPrimaryImage"
            />
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UCheckbox v-model="form.is_visible" label="Visible" />
            <UCheckbox v-model="form.available" label="Available" />
            <UCheckbox v-model="form.featured" label="Featured" />
          </div>
        </template>

        <template v-else>
          <p class="text-xs text-muted">Source (English): {{ form.name }}</p>
          <UFormField :label="`Name (${locale})`">
            <UInput v-model="localizedFields.name" class="w-full" />
          </UFormField>
          <UFormField :label="`Description (${locale})`">
            <UTextarea v-model="localizedFields.description" :rows="4" class="w-full" />
          </UFormField>
          <UFormField :label="`SEO title (${locale})`">
            <UInput v-model="localizedFields.seo_title" class="w-full" />
          </UFormField>
          <UFormField :label="`SEO description (${locale})`">
            <UTextarea v-model="localizedFields.seo_description" :rows="2" class="w-full" />
          </UFormField>
        </template>
      </DashboardListItemDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { Product, ProductCategory } from '~/server/types/products'
import { isCurrencyCode } from '~/shared/currencies'
import { majorAmountToMinor, minorAmountToMajor } from '~/shared/prices'
import { getErrorMessage } from '~/utils/errors'
import { formatProductPriceLabel } from '~/utils/product-money'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const route = useRoute()
const dashboardApi = useDashboardApi()
const toast = useToast()
const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
const presentation = requireProductPresentation(vertical)
const rawCurrency = dashboard.site.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency

const categoryId = computed(() => String(route.params.categoryId ?? ''))
const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
const productsPath = computed(() => locationPaths.value?.products ?? '')

const categories = ref<ProductCategory[]>([])
const products = ref<Product[]>([])
const pending = ref(true)
const loadError = ref<string | null>(null)
const editing = ref(false)
const selected = ref<string[]>([])
const orderDirty = ref(false)

const category = computed(() => categories.value.find(row => row.id === categoryId.value) ?? null)
const listItems = computed(() => products.value.map(row => ({ id: row.id, title: row.name, row })))
const moveTargets = computed(() => categories.value.filter(row => row.id !== categoryId.value))

useSeoMeta({ title: () => `${category.value?.name ?? presentation.collectionLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

function priceLabel(product: Product) {
  return formatProductPriceLabel(product)
}

function isCategoryList(value: unknown): value is { categories: ProductCategory[] } {
  return isRecord(value) && Array.isArray(value.categories)
}
function isProductList(value: unknown): value is { success: true; products: Product[] } {
  return isRecord(value) && Array.isArray(value.products)
}
function isOne(value: unknown): value is { success: true; product: Product } {
  return isRecord(value) && isRecord(value.product)
}

async function load() {
  const id = locationId.value
  if (!id) return
  pending.value = true
  loadError.value = null
  try {
    const [categoryResponse, productResponse] = await Promise.all([
      dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/categories`, { validate: isCategoryList }),
      dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products`, { validate: isProductList }),
    ])
    categories.value = categoryResponse.categories
    products.value = productResponse.products.filter(product => product.category_id === categoryId.value)
    if (!categoryResponse.categories.some(row => row.id === categoryId.value)) {
      throw createError({ statusCode: 404, statusMessage: 'Product category not found' })
    }
  } catch (error) {
    loadError.value = getErrorMessage(error, `Failed to load ${presentation.itemLabel.toLowerCase()}s`)
  } finally {
    pending.value = false
  }
}

/** Local while the edit state is open; committed once when it closes. */
function moveProduct(item: { row: Product }, direction: -1 | 1) {
  const index = products.value.findIndex(row => row.id === item.row.id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= products.value.length) return
  const next = [...products.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  products.value = next
  orderDirty.value = true
}

async function commitOrder() {
  const id = locationId.value
  if (!id || !orderDirty.value) return
  orderDirty.value = false
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/order`, {
      method: 'PUT',
      body: { category_id: categoryId.value, product_ids: products.value.map(row => row.id) },
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

const moveDialogOpen = ref(false)
const moveTargetId = ref('')
const moving = ref(false)

watch(moveDialogOpen, (open) => {
  if (open) moveTargetId.value = ''
})

/** Moving the open item is the same action as a bulk move, with one selected. */
function moveOne() {
  if (!editingId.value) return
  selected.value = [editingId.value]
  dialogOpen.value = false
  moveDialogOpen.value = true
}

async function moveSelected() {
  const id = locationId.value
  if (!id || !moveTargetId.value || !selected.value.length) return
  moving.value = true
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/move`, {
      method: 'POST',
      body: { product_ids: selected.value, category_id: moveTargetId.value },
      validate: isRecord,
    })
    moveDialogOpen.value = false
    selected.value = []
    editing.value = false
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to move ${presentation.itemLabel.toLowerCase()}s`), color: 'error' })
  } finally {
    moving.value = false
  }
}

const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const removing = ref(false)
const locale = ref('en')
const translationLocales = ref<string[]>([])
const localizedFields = ref({ name: '', description: '', seo_title: '', seo_description: '' })
const form = reactive({
  name: '',
  price_major: '',
  has_fixed_price: true,
  price_note: '',
  description: '',
  order_url: '',
  tags_text: '',
  is_visible: true,
  available: true,
  featured: false,
  image_asset_id: null as string | null,
})

function resetForm() {
  form.name = ''
  form.price_major = ''
  form.has_fixed_price = true
  form.price_note = ''
  form.description = ''
  form.order_url = ''
  form.tags_text = ''
  form.is_visible = true
  form.available = true
  form.featured = false
  form.image_asset_id = null
}

function openNew() {
  locale.value = 'en'
  editingId.value = null
  resetForm()
  dialogOpen.value = true
}

function openExisting(item: { row: Product }) {
  locale.value = 'en'
  const product = item.row
  editingId.value = product.id
  form.name = product.name
  form.price_major = product.price ? minorAmountToMajor(product.price.amount_minor, product.price.currency) : ''
  form.has_fixed_price = product.price !== null
  form.price_note = product.details.find(detail => detail.key === 'price-note')?.values[0] ?? ''
  form.description = product.description
  form.order_url = product.order_url ?? ''
  form.tags_text = product.tags.join(', ')
  form.is_visible = product.is_visible
  form.available = product.available
  form.featured = product.featured
  form.image_asset_id = product.image?.asset_id ?? null
  dialogOpen.value = true
}

function payload() {
  const price = form.has_fixed_price
    ? { amount_minor: majorAmountToMinor(form.price_major, currency), currency, unit: 'item' as const, tax_behavior: 'unspecified' as const }
    : null
  const existing = products.value.find(row => row.id === editingId.value)
  const details = (existing?.details ?? []).filter(detail => detail.key !== 'price-note')
  const priceNote = form.price_note.trim()
  return {
    name: form.name.trim(),
    description: form.description,
    price,
    order_url: form.order_url || null,
    tags: form.tags_text.split(',').map(tag => tag.trim()).filter(Boolean),
    details: priceNote ? [...details, { key: 'price-note', label: 'Price', values: [priceNote] }] : details,
    is_visible: form.is_visible,
    available: form.available,
    featured: form.featured,
  }
}

async function save() {
  const id = locationId.value
  if (!id) return
  saving.value = true
  try {
    const endpoint = `/api/editor/sites/${siteId}/locations/${id}/products`
    if (editingId.value) {
      await dashboardApi(`${endpoint}/${editingId.value}`, { method: 'PATCH', body: payload(), validate: isOne })
    } else {
      await dashboardApi(endpoint, { method: 'POST', body: { ...payload(), category_id: categoryId.value }, validate: isOne })
    }
    dialogOpen.value = false
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to save ${presentation.itemLabel.toLowerCase()}`), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function removeEditing() {
  const id = locationId.value
  if (!id || !editingId.value) return
  removing.value = true
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products/${editingId.value}`, { method: 'DELETE', validate: isRecord })
    dialogOpen.value = false
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to delete ${presentation.itemLabel.toLowerCase()}`), color: 'error' })
    throw error
  } finally {
    removing.value = false
  }
}

async function setPrimaryImage(assetId: string | null) {
  if (!editingId.value) return
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/media/placements`, {
      method: 'PUT',
      body: { placement: { owner_type: 'product', owner_id: editingId.value, slot: 'image' }, asset_id: assetId },
      validate: isRecord,
    })
    form.image_asset_id = assetId
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to update the photo'), color: 'error' })
  }
}

function isLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}

async function loadLocales() {
  try {
    const response = await dashboardApi(`/api/editor/sites/${siteId}/locales`, { validate: isLocalesResponse })
    translationLocales.value = response.languages.filter(item => item.locale_status === 'published' && !item.is_source).map(item => item.locale)
  } catch {
    translationLocales.value = []
  }
}

function isLocalizationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}

watch(locale, async (value) => {
  if (!editingId.value || value === 'en') return
  try {
    const response = await dashboardApi(
      `/api/editor/sites/${siteId}/localization/product/${editingId.value}/${encodeURIComponent(value)}`,
      { validate: isLocalizationResponse },
    )
    const values = response.localization.values
    localizedFields.value = {
      name: typeof values.name === 'string' ? values.name : '',
      description: typeof values.description === 'string' ? values.description : '',
      seo_title: typeof values.seo_title === 'string' ? values.seo_title : '',
      seo_description: typeof values.seo_description === 'string' ? values.seo_description : '',
    }
  } catch {
    // No translation saved for this locale yet — start blank.
    localizedFields.value = { name: '', description: '', seo_title: '', seo_description: '' }
  }
})

async function saveLocalized() {
  if (!editingId.value) return
  saving.value = true
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/localization/product/${editingId.value}/${encodeURIComponent(locale.value)}`, {
      method: 'PUT',
      body: { values: { ...localizedFields.value } },
      validate: isRecord,
    })
    dialogOpen.value = false
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to save translation'), color: 'error' })
  } finally {
    saving.value = false
  }
}

watch([locationId, categoryId], () => {
  editing.value = false
  dialogOpen.value = false
  moveDialogOpen.value = false
  selected.value = []
  void load()
}, { immediate: true })

await loadLocales()
</script>

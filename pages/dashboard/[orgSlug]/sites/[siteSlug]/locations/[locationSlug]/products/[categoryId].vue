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
        :save-disabled="!form.name.trim() || (form.price_mode === 'amount' && !form.price_major.trim()) || incompleteDetail"
        @save="locale === 'en' ? save() : saveLocalized()"
        @remove="removeEditing"
      >
        <UFormField v-if="editingId && translationLocales.length" label="Language">
          <USelect v-model="locale" :items="localeItems" class="w-full" aria-label="Field language" />
        </UFormField>

        <template v-if="locale === 'en'">
          <!--
            The photo leads the sheet the way it leads the row and the way it
            leads Airbnb's own photo detail: it is the thing you recognise the
            dish by, so it is the thing you see first and largest.
          -->
          <UFormField v-if="editingId && locationId">
            <DashboardCoverPhotoField
              :site-id="siteId"
              :location-id="locationId"
              :model-value="form.image_asset_id"
              :preview-url="editingImage?.public_url ?? null"
              :preview-alt="editingImage?.alt_text || form.name"
              title="Dish photo"
              testid="product-photo"
              @update:model-value="setPrimaryImage"
            />
          </UFormField>

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

          <!--
            A dish shows an amount, or wording in place of one, or nothing. Those
            are the only three states the server accepts, so they are the only
            three the form offers: the old "fixed price" checkbox let you build
            an amount and wording together and then refused to save it.
          -->
          <UFormField label="Price">
            <URadioGroup v-model="form.price_mode" :items="priceModes" :ui="{ fieldset: 'flex flex-wrap gap-4' }" />
          </UFormField>
          <UFormField v-if="form.price_mode === 'amount'" :label="`Amount (${currency})`">
            <UInput v-model="form.price_major" inputmode="decimal" placeholder="280" class="w-full" />
          </UFormField>
          <UFormField
            v-else-if="form.price_mode === 'wording'"
            label="Wording"
            description="Shown to customers in place of a number."
          >
            <UInput v-model="form.price_note" placeholder="Market price" class="w-full" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="form.description" :rows="4" class="w-full" />
          </UFormField>
          <UFormField label="Order URL">
            <UInput v-model="form.order_url" type="url" placeholder="https://…" class="w-full" />
          </UFormField>
          <UFormField label="Tags">
            <UInputTags
              v-model="form.tags"
              placeholder="Add a tag"
              :max="PRODUCT_LIMITS.tags"
              :max-length="PRODUCT_LIMITS.tag"
              delimiter=","
              add-on-blur
              add-on-paste
              class="w-full"
            />
          </UFormField>

          <!--
            Details are the labelled facts under the dish on the public page —
            allergens, ingredients, spice level. They arrive from the menu
            import and they publish, so the tenant has to be able to reach them.
            The stored kebab-case key is derived from the label rather than
            typed: it is an identifier no customer ever sees.
          -->
          <UFormField
            label="Details"
            description="Extra facts shown under this item on your site."
          >
            <div class="space-y-3">
              <div
                v-for="(group, index) in form.details"
                :key="index"
                class="space-y-2 rounded-lg border border-default p-3"
                :data-testid="`product-detail-${index}`"
              >
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="group.label"
                    placeholder="Allergens"
                    :maxlength="PRODUCT_LIMITS.detailLabel"
                    class="flex-1"
                    aria-label="Detail name"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="ghost"
                    :aria-label="`Remove ${group.label || 'detail'}`"
                    :data-testid="`product-detail-remove-${index}`"
                    @click="form.details.splice(index, 1)"
                  />
                </div>
                <UInputTags
                  v-model="group.values"
                  placeholder="Add a value"
                  :max="PRODUCT_LIMITS.detailValues"
                  :max-length="PRODUCT_LIMITS.detailValue"
                  delimiter=","
                  add-on-blur
                  add-on-paste
                  class="w-full"
                />
              </div>
              <p v-if="incompleteDetail" class="text-sm text-muted">
                Give every detail a name and at least one value, or remove it.
              </p>
              <UButton
                v-if="form.details.length < PRODUCT_LIMITS.detailGroups"
                label="Add a detail"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                data-testid="product-detail-add"
                @click="form.details.push({ key: null, label: '', values: [] })"
              />
            </div>
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
import DashboardMediaThumb from '~/components/dashboard/DashboardMediaThumb.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import DashboardCoverPhotoField from '~/components/dashboard/DashboardCoverPhotoField.vue'
import type { Product, ProductCategory } from '~/server/types/products'
import type { ProductDetailDraft } from '~/utils/product-fields'
import { fromProductDetailDrafts, normalizeProductTags, toProductDetailDrafts } from '~/utils/product-fields'
import { PRODUCT_LIMITS } from '~/shared/product-limits'
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
// The picker's own trigger is a small row; the open dish shows its photo large,
// so the preview reads from the loaded Product rather than the picker's state.
const editingImage = computed(() => products.value.find(row => row.id === editingId.value)?.image ?? null)

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
    loadError.value = getErrorMessage(error, `Failed to load ${presentation.itemLabelPlural.toLowerCase()}`)
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
    // Commit any pending reorder first. Closing the edit state below would
    // otherwise fire commitOrder with the pre-move list, sending IDs that no
    // longer belong to this category.
    await commitOrder()
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
    toast.add({ description: getErrorMessage(error, `Failed to move ${presentation.itemLabelPlural.toLowerCase()}`), color: 'error' })
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
const localeItems = computed(() => ['en', ...translationLocales.value])
const localizedFields = ref({ name: '', description: '', seo_title: '', seo_description: '' })
/** The three states the server accepts; nothing else is representable. */
type PriceMode = 'amount' | 'wording' | 'none'
const priceModes = [
  { label: 'Amount', value: 'amount' },
  { label: 'Wording', value: 'wording' },
  { label: 'No price', value: 'none' },
]

const form = reactive({
  name: '',
  price_major: '',
  price_mode: 'amount' as PriceMode,
  price_note: '',
  description: '',
  order_url: '',
  tags: [] as string[],
  details: [] as ProductDetailDraft[],
  is_visible: true,
  available: true,
  featured: false,
  image_asset_id: null as string | null,
})

function resetForm() {
  form.name = ''
  form.price_major = ''
  form.price_mode = 'amount'
  form.price_note = ''
  form.description = ''
  form.order_url = ''
  form.tags = []
  form.details = []
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
  form.price_note = product.details.find(detail => detail.key === 'price-note')?.values[0] ?? ''
  form.price_mode = product.price !== null ? 'amount' : (form.price_note ? 'wording' : 'none')
  form.description = product.description
  form.order_url = product.order_url ?? ''
  form.tags = [...product.tags]
  form.details = toProductDetailDrafts(product.details)
  form.is_visible = product.is_visible
  form.available = product.available
  form.featured = product.featured
  form.image_asset_id = product.image?.asset_id ?? null
  dialogOpen.value = true
}

// A half-filled group cannot be saved, and is not silently dropped either: the
// tenant typed it, so the save waits rather than discarding their work.
const incompleteDetail = computed(() => form.details.some(group =>
  !group.label.trim() || !group.values.some(value => value.trim())))

function payload() {
  const price = form.price_mode === 'amount'
    ? { amount_minor: majorAmountToMinor(form.price_major, currency), currency, unit: 'item' as const, tax_behavior: 'unspecified' as const }
    : null
  const details = fromProductDetailDrafts(form.details)
  // Wording is dropped unless it is the chosen mode, so switching to an amount
  // cannot leave a stale note behind for the server to reject.
  const priceNote = form.price_mode === 'wording' ? form.price_note.trim() : ''
  return {
    name: form.name.trim(),
    description: form.description,
    price,
    order_url: form.order_url || null,
    tags: normalizeProductTags(form.tags),
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

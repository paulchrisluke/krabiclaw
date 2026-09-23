<template>
  <!-- One product: its rows are the things it holds, each a leaf below this level. -->
  <DashboardIndexPanel id="product" :title="form.name || presentation.itemLabel" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
    <template v-if="product" #right>
      <DashboardResourceLocalization
      :organization-id="organizationId"
      resource-type="product"
      :resource-id="productId"
      :resource-label="presentation.itemLabel.toLowerCase()"
      :fields="productLocalizationFields"
      :load-values="loadProductLocalization"
      :save-values="saveProductLocalization"
      :language-settings-path="siteLocalizationSettingsPath"
      />
    </template>

    <UAlert
      v-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`${presentation.itemLabel} could not be loaded`"
      :description="loadError"
    />
    <template v-else>
      <div v-if="isNew" class="mb-6 flex justify-end">
        <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
      </div>
      <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
    </template>
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'

export const SECTION_KEYS = ['photo', 'name', 'price', 'description', 'options', 'order-url', 'tags', 'attributes', 'publication', 'booking'] as const
export type SectionKey = typeof SECTION_KEYS[number]

export interface ScheduleSlotDraft { weekday: number; start_time: string; capacity: string }

export interface OptionValueDraft { id: string | null; value: string }
export interface OptionDraft { id: string; name: string; values: OptionValueDraft[] }
export interface VariantDraft {
  /**
   * The combination of option values this variant selects, not its row id.
   *
   * A rebuild after an option edit looks a variant up by the combination it
   * describes; keying by id here made every surviving combination look new,
   * which took its id and its prices with it.
   */
  key: string
  id: string | null
  name: string
  selections: Record<string, string>
  /** Restated on save: a submitted variant is its complete state. */
  sku: string | null
  active: boolean
  price_major: string
  /** The amount this box held when the product was loaded. */
  loaded_price_major: string
  /** Every offer this variant already has, kept whole so an edit here cannot retire the others. */
  prices: Price[]
}

/** The editable shape of one product, as its leaves bind to it. */
export interface ProductForm {
  name: string
  description: string
  order_url: string
  tags: string[]
  options: OptionDraft[]
  variants: VariantDraft[]
  metafields: Record<string, MetafieldValue>
  active: boolean
  published: boolean
  location_active: boolean
  location_published: boolean
  bookable: boolean
  booking_duration: string
  booking_capacity: string
  image_asset_id: string | null
}

/** The product's draft and what its leaves show or do beside their one field. */
export interface ProductEditor {
  form: ProductForm
  product: Ref<Product | null>
  presentation: ComputedRef<{ itemLabel: string }>
  currency: string
  organizationId: string
  locationId: ComputedRef<string | null>
  definitions: Ref<MetafieldDefinition[]>
  isNew: ComputedRef<boolean>
  sectionLabels: Record<SectionKey, string>
  saving: Ref<boolean>
  saveError: Ref<string | null>
  photoError: Ref<string | null>
  saveLabel: Ref<string | undefined>
  saveDisabled: Ref<boolean>
  setPrimaryImage: (assetId: string | null) => Promise<void>
  addOption: () => void
  removeOption: (index: number) => void
  setOptionValues: (index: number, values: string[]) => void
  metafieldKey: (definition: MetafieldDefinition) => string
  listValue: (definition: MetafieldDefinition) => string[]
  textValue: (definition: MetafieldDefinition) => string
  integerValue: (definition: MetafieldDefinition) => number | undefined
  setIntegerMetafield: (definition: MetafieldDefinition, value: unknown) => void
  booleanValue: (definition: MetafieldDefinition) => boolean
  weekdays: ReadonlyArray<{ value: number; label: string }>
  scheduleLoading: Ref<boolean>
  slotsFor: (weekday: number) => ScheduleSlotDraft[]
  addSlot: (weekday: number) => void
  removeSlot: (slot: ScheduleSlotDraft) => void
  revert: () => void
  save: () => Promise<void>
}

export const productEditorKey = Symbol('product-editor') as InjectionKey<ProductEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import type { Collection, Product } from '~/server/types/products'
import type { MetafieldDefinition, MetafieldValue } from '~/shared/metafields'
import { metafieldHandle, PRICING_NOTE_HANDLE } from '~/shared/metafields'
import { isCurrencyCode } from '~/shared/currencies'
import { majorAmountToMinor, minorAmountToMajor, selectPrice, type Price } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'
import { presentationForProduct, productSurfaceOf, requireProductPresentation } from '~/utils/product-presentation'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

const route = useRoute()
const dashboardApi = useDashboardApi()
const collectionId = computed(() => String(route.params.collectionId ?? route.params.categoryId ?? ''))
const productId = computed(() => String(route.params.productId ?? ''))
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/locations/${String(route.params.locationSlug)}`)
// The surface is the product's own, not the URL's: a dish saved as bookable is
// an experience from that moment, and the rows it returns to have moved with
// it. Until the row has loaded the URL is all there is to go on.
// Declared above the computeds that read it. `surfacePath` resolves the
// surface from the product's own row, so evaluating it before this line was
// reached threw "Cannot access 'product' before initialization" and the
// whole editor 500d.
const product = ref<Product | null>(null)

const surfacePath = computed(() => {
  const surface = product.value ? productSurfaceOf(vertical, product.value) : String(route.params.surface ?? '')
  return `${locationPath.value}/products/${surface}`
})
const collectionPath = computed(() => `${surfacePath.value}/${collectionId.value}`)
const itemPath = computed(() => `${collectionPath.value}/${productId.value}`)
const level = useRouteLevel()

const organizationId = await useDashboardOrganizationId()
const dashboard = useDashboardOrganization()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.organization.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// The words follow the product: a class is an experience whatever the site
// sells otherwise. Until the row has loaded, and for a product being created,
// the screen speaks the vertical's own surface — it is not yet known to be
// anything else.
const presentation = computed(() => (product.value ? presentationForProduct(vertical, product.value) : requireProductPresentation(vertical)))
const rawCurrency = dashboard.organization.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)

// ── Which leaf is open ──────────────────────────────────

const sectionLabels: Record<SectionKey, string> = {
  'photo': 'Photo',
  'name': 'Name',
  'price': 'Price',
  'description': 'Description',
  'options': 'Options',
  'order-url': 'Order link',
  'tags': 'Tags',
  'attributes': 'Attributes',
  'publication': 'Where it appears',
  'booking': 'Bookings',
}

const detailKey = computed(() => level.child.value)
const editorKey = computed<SectionKey>(() => (detailKey.value ?? 'photo') as SectionKey)

const isNew = computed(() => productId.value === 'new')

// ── Load ────────────────────────────────────────────────
const collections = ref<Collection[]>([])
const definitions = ref<MetafieldDefinition[]>([])
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const photoError = ref<string | null>(null)
const saving = ref(false)

watch(editorKey, () => {
  saveError.value = null
  photoError.value = null
})

const isCollectionList = (value: unknown): value is { collections: Collection[] } =>
  isRecord(value) && Array.isArray(value.collections)
const isDefinitionList = (value: unknown): value is { definitions: MetafieldDefinition[] } =>
  isRecord(value) && Array.isArray(value.definitions)
const isProductList = (value: unknown): value is { success: true, products: Product[] } =>
  isRecord(value) && Array.isArray(value.products)
const isOne = (value: unknown): value is { success: true, product: Product } =>
  isRecord(value) && isRecord(value.product)


// What the last successful (or in-flight) load was for. locationId resolves
// after mount on a cold navigation, so onMounted and the watcher below both
// fire for the same product; this loads it once.
//
// `force` is for the writers. A save or a photo change has just made this row
// different from what was loaded, so the key matching is exactly the wrong
// answer there: it left `product` stale, and the photo preview and every index
// summary read `product`, not the form.
let loadedKey = ''

async function load(options: { force?: boolean } = {}) {
  const id = locationId.value
  if (!id || isNew.value) {
    if (!isNew.value) return
    // A new item still needs the attribute vocabulary to render its form.
    definitions.value = (await dashboardApi(`/api/editor/organizations/${organizationId}/metafield-definitions`, { validate: isDefinitionList })).definitions
    return
  }
  const key = `${id}:${productId.value}`
  if (key === loadedKey && !options.force) return
  loadedKey = key
  loadError.value = null
  try {
    const [collectionResponse, productResponse, definitionResponse] = await Promise.all([
      dashboardApi(`/api/editor/organizations/${organizationId}/collections?location_id=${encodeURIComponent(id)}`, { validate: isCollectionList }),
      dashboardApi(`/api/editor/organizations/${organizationId}/locations/${encodeURIComponent(id)}/products/${encodeURIComponent(productId.value)}`, { validate: isOne }),
      dashboardApi(`/api/editor/organizations/${organizationId}/metafield-definitions`, { validate: isDefinitionList }),
    ])
    collections.value = collectionResponse.collections
    definitions.value = definitionResponse.definitions
    product.value = productResponse.product
    loadForm(productResponse.product)
  } catch (error) {
    loadedKey = ''
    if (isNotFoundError(error)) return showError(createError({ statusCode: 404, statusMessage: `${presentation.value.itemLabel} not found` }))
    loadError.value = getErrorMessage(error, `Failed to load this ${presentation.value.itemLabel.toLowerCase()}`)
  }
}

// Called with no arguments on purpose: `watch` hands its listener
// (value, oldValue, onCleanup), which would land in `options`.
onMounted(() => { void load() })
watch(locationId, () => { void load() })

// ── The form ────────────────────────────────────────────

const form = reactive<ProductForm>({
  name: '',
  description: '',
  order_url: '',
  tags: [] as string[],
  options: [] as OptionDraft[],
  variants: [] as VariantDraft[],
  metafields: {} as Record<string, MetafieldValue>,
  active: true,
  published: false,
  location_active: true,
  location_published: false,
  bookable: false,
  booking_duration: '',
  booking_capacity: '',
  image_asset_id: null as string | null,
})

/** What this location and currency pays for one variant, as a major-unit string. */
function variantPriceMajor(variant: Product['variants'][number]): string {
  const price = selectPrice(variant.prices, { currency, location_id: locationId.value, at: new Date().toISOString() })
  return price ? minorAmountToMajor(price.unit_amount, price.currency) : ''
}

/** The options, variants and prices as loaded, so a save can tell what changed. */
const loadedCatalogShape = ref('')

function loadForm(row: Product) {
  form.name = row.name
  form.description = row.description
  form.order_url = row.order_url ?? ''
  form.tags = [...row.tags]
  form.options = row.options.map(option => ({
    id: option.id,
    name: option.name,
    values: option.values.map(value => ({ id: value.id, value: value.value })),
  }))
  form.variants = row.variants.map(variant => ({
    key: form.options.length ? combinationKey(variant.option_values) : 'default',
    id: variant.id,
    name: variant.name,
    selections: { ...variant.option_values },
    sku: variant.sku,
    active: variant.active,
    price_major: variantPriceMajor(variant),
    loaded_price_major: variantPriceMajor(variant),
    prices: variant.prices.map(price => ({ ...price })),
  }))
  form.metafields = { ...row.metafields }
  form.active = row.active
  form.published = row.publications.find(entry => entry.organization_id === organizationId)?.published ?? false
  const here = row.locations.find(entry => entry.location_id === locationId.value)
  form.location_active = here?.active ?? true
  form.location_published = here?.published ?? false
  form.image_asset_id = row.image?.asset_id ?? null
  // The configuration row is the capability, so the checkbox is its existence
  // and the fields are its values. The form used to open every product as "Not
  // bookable" with empty defaults, whatever was stored.
  form.bookable = row.booking !== null
  form.booking_duration = row.booking?.duration_minutes === null || row.booking === null ? '' : String(row.booking.duration_minutes)
  form.booking_capacity = row.booking?.default_capacity === null || row.booking === null ? '' : String(row.booking.default_capacity)
  loadedCatalogShape.value = catalogShapeOf()
}

/**
 * The label combination a set of selections names, in option order.
 *
 * Both the loaded variants and the rebuilt ones are keyed by this, so a
 * combination that survives an option edit is recognised as the same one.
 */
function combinationKey(selections: Record<string, string>): string {
  return form.options
    .filter(option => option.name.trim() && option.values.length)
    .map(option => option.values.find(value => (value.id ?? value.value) === selections[option.id])?.value ?? '')
    .join(' / ')
}

function metafieldKey(definition: MetafieldDefinition): string {
  return metafieldHandle(definition)
}
function listValue(definition: MetafieldDefinition): string[] {
  const value = form.metafields[metafieldKey(definition)]
  return Array.isArray(value) ? value : []
}
function textValue(definition: MetafieldDefinition): string {
  const value = form.metafields[metafieldKey(definition)]
  return typeof value === 'string' ? value : ''
}
function integerValue(definition: MetafieldDefinition): number | undefined {
  const value = form.metafields[metafieldKey(definition)]
  // undefined is "not set", which is what an empty number box means. Zero is a
  // value someone typed.
  return typeof value === 'number' ? value : undefined
}
function setIntegerMetafield(definition: MetafieldDefinition, value: unknown) {
  const key = metafieldKey(definition)
  if (typeof value === 'number' && Number.isFinite(value)) {
    form.metafields[key] = Math.trunc(value)
    return
  }
  // An emptied box is the attribute being unset, not a zero.
  form.metafields = Object.fromEntries(Object.entries(form.metafields).filter(([entry]) => entry !== key))
}
function booleanValue(definition: MetafieldDefinition): boolean {
  return form.metafields[metafieldKey(definition)] === true
}

// ── Options and the combinations they produce ───────────
function addOption() {
  form.options.push({ id: `new-option-${form.options.length + 1}`, name: '', values: [] })
  rebuildVariants()
}
function removeOption(index: number) {
  form.options.splice(index, 1)
  rebuildVariants()
}
function setOptionValues(index: number, values: string[]) {
  const option = form.options[index]
  if (!option) return
  // Keep the ids of values that survived the edit, so the variants selecting
  // them keep pointing at the same rows.
  const existing = new Map(option.values.map(value => [value.value, value.id]))
  option.values = values.map(value => ({ id: existing.get(value) ?? null, value }))
  rebuildVariants()
}

/**
 * Every combination of option values, once each.
 *
 * Prices already typed survive by combination, not by position: reordering an
 * option's values must not move a price onto a different thing.
 */
function rebuildVariants() {
  const options = form.options.filter(option => option.name.trim() && option.values.length)
  if (!options.length) {
    const first = form.variants[0]
    form.variants = [{
      key: 'default', id: first?.id ?? null, name: form.name || 'Default', selections: {},
      sku: first?.sku ?? null, active: first?.active ?? true,
      price_major: first?.price_major ?? '', loaded_price_major: first?.loaded_price_major ?? '', prices: first?.prices ?? [],
    }]
    return
  }
  const draftByKey = new Map(form.variants.map(variant => [variant.key, variant]))
  let combinations: Array<{ selections: Record<string, string>; labels: string[] }> = [{ selections: {}, labels: [] }]
  for (const option of options) {
    combinations = combinations.flatMap(combination => option.values.map(value => ({
      selections: { ...combination.selections, [option.id]: value.id ?? value.value },
      labels: [...combination.labels, value.value],
    })))
  }
  form.variants = combinations.map((combination) => {
    const key = combination.labels.join(' / ')
    const prior = draftByKey.get(key)
    return {
      key,
      id: prior?.id ?? null,
      name: key,
      selections: combination.selections,
      sku: prior?.sku ?? null,
      active: prior?.active ?? true,
      price_major: prior?.price_major ?? '',
      loaded_price_major: prior?.loaded_price_major ?? '',
      prices: prior?.prices ?? [],
    }
  })
}

const sectionValid = computed(() => {
  if (editorKey.value === 'name') return Boolean(form.name.trim())
  if (editorKey.value === 'options') {
    return form.options.every(option => option.name.trim() && option.values.length > 0)
  }
  if (editorKey.value === 'booking') {
    if (!form.bookable) return true
    return Boolean(form.booking_duration.trim())
  }
  return true
})

// ── The index ─────────────────────────────────────────────
function listSummary(values: readonly string[], empty: string) {
  return values.length ? values.join(', ') : empty
}

function priceSummary(): string {
  const row = product.value
  if (!row) return ''
  if (row.variants.length > 1) return `${row.variants.length} combinations`
  const variant = row.variants[0]
  if (!variant) return 'No price set'
  const price = selectPrice(variant.prices, { currency, location_id: locationId.value, at: new Date().toISOString() })
  const amount = formatProductMoney(price)
  if (amount) return amount
  // Priced in words — "Contact us for group pricing" — is a price the merchant
  // set, and the public page shows it; "No price set" would call it missing.
  const note = row.metafields[PRICING_NOTE_HANDLE]
  return typeof note === 'string' && note.trim() ? note : 'No price set'
}

function bookingSummary(): string {
  const minutes = `${form.booking_duration || '?'} minutes`
  const id = locationId.value
  if (!id || scheduleLoadedFor.value !== `${productId.value}:${id}`) return minutes
  const count = schedule.value.filter(slot => slot.start_time.trim()).length
  return `${minutes} · ${count === 1 ? '1 time' : `${count} times`} a week`
}

function publicationSummary(): string {
  const parts: string[] = [form.active ? 'On sale' : 'Not on sale']
  parts.push(form.published ? 'published' : 'withheld')
  if (!form.location_published) parts.push('hidden here')
  return parts.join(' · ')
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => {
  const image = product.value?.image
  if (isNew.value) return [{
    id: 'item',
    items: [{ id: 'name', label: 'Name', summary: form.name || 'Not named yet', placeholder: !form.name, to: `${itemPath.value}/name` }],
  }]
  // Until the row is here there is nothing to summarize. "Not named yet" and
  // "Not bookable" are statements about a product; shown while loading they
  // were statements about the network.
  if (!product.value) return [{
    id: 'item',
    items: [{ id: 'loading', label: 'Loading', summary: `Loading this ${presentation.value.itemLabel.toLowerCase()}…`, placeholder: true }],
  }]
  return [
    {
      id: 'item',
      items: [
        {
          id: 'photo',
          label: 'Photo',
          summary: image ? '' : 'No photo yet',
          placeholder: !image,
          to: `${itemPath.value}/photo`,
        },
        { id: 'name', label: 'Name', summary: form.name || 'Not named yet', placeholder: !form.name, to: `${itemPath.value}/name` },
        { id: 'price', label: 'Price', summary: priceSummary(), placeholder: priceSummary() === 'No price set', to: `${itemPath.value}/price` },
        {
          id: 'description',
          label: 'Description',
          summary: form.description || 'Nothing written yet',
          placeholder: !form.description,
          to: `${itemPath.value}/description`,
        },
      ],
    },
    {
      id: 'more',
      label: 'More',
      items: [
        {
          id: 'options',
          label: 'Options',
          summary: listSummary(form.options.map(option => option.name).filter(Boolean), 'No options'),
          placeholder: !form.options.length,
          to: `${itemPath.value}/options`,
        },
        { id: 'order-url', label: 'Order link', summary: form.order_url || 'No link', placeholder: !form.order_url, to: `${itemPath.value}/order-url` },
        { id: 'tags', label: 'Tags', summary: listSummary(form.tags, 'No tags'), placeholder: !form.tags.length, to: `${itemPath.value}/tags` },
        {
          id: 'attributes',
          label: 'Attributes',
          summary: listSummary(Object.keys(form.metafields), 'None set'),
          placeholder: !Object.keys(form.metafields).length,
          to: `${itemPath.value}/attributes`,
        },
        { id: 'publication', label: 'Where it appears', summary: publicationSummary(), to: `${itemPath.value}/publication` },
        { id: 'booking', label: 'Bookings', summary: form.bookable ? bookingSummary() : 'Not bookable', placeholder: !form.bookable, to: `${itemPath.value}/booking` },
      ],
    },
  ]
})

/**
 * The sections this product actually has, read from the rows it offers rather
 * than from a list of every section a product could ever have — a product being
 * created has only its name, and the rows already say so.
 */
const openSections = computed(() => navigationGroups.value.flatMap(group => group.items.map(item => item.id)))

// A watcher, not a setup-time check: moving between leaves reuses this component.
watchEffect(() => {
  // A level on its way out after a navigation elsewhere answers about a route
  // it is no longer part of, so it judges nothing.
  if (level.stale.value) return
  // Nor does it judge before the record arrives: until then the rows are a
  // single "Loading" placeholder, and every real section read as unsupported —
  // a cold load of `…/mi-1/price` 404'd a page that exists.
  if (!isNew.value && !product.value) return
  if (level.mode.value === 'yield' || (detailKey.value && !openSections.value.includes(detailKey.value))) {
    showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  }
})

// ── Save / cancel ───────────────────────────────────────
/** The options, variants and prices this form is describing, exactly as they would be sent. */
function buildCatalog() {
  const declaredOptions = form.options.filter(option => option.name.trim() && option.values.length)
  const submittedOptionKeys = new Map(declaredOptions.map(option => [
    option.id,
    option.id.startsWith('new-option-') ? option.name.trim() : option.id,
  ]))
  // This box shows one amount: what this location pays, in this site's
  // currency. Every other offer the variant carries — another location's
  // price, another currency, a recurring term — is restated untouched, with
  // its own id, so editing the one amount on screen cannot silently retire the
  // ones that are not.
  const selection = { currency, location_id: locationId.value, at: new Date().toISOString() }
  const carry = (price: Price) => ({
    id: price.id, unit_amount: price.unit_amount, currency: price.currency, location_id: price.location_id,
    active: price.active, type: price.type, recurring_interval: price.recurring_interval,
    recurring_interval_count: price.recurring_interval_count, tax_behavior: price.tax_behavior,
    compare_at_unit_amount: price.compare_at_unit_amount, valid_from_at: price.valid_from_at,
    valid_until_at: price.valid_until_at, source: price.source,
  })
  const priceFor = (variant: VariantDraft) => {
    const typed = variant.price_major.trim()
    if (typed === variant.loaded_price_major.trim()) return variant.prices.map(carry)
    const governing = selectPrice(variant.prices, selection)
    // An empty box is not a price of zero. Zero is typed, and means free.
    if (!typed) return variant.prices.filter(price => price.id !== governing?.id).map(carry)
    if (!governing) {
      return [...variant.prices.map(carry), { unit_amount: majorAmountToMinor(typed, currency), currency, location_id: locationId.value }]
    }
    return variant.prices.map(price => (price.id === governing.id
      ? { ...carry(price), unit_amount: majorAmountToMinor(typed, price.currency) }
      : carry(price)))
  }
  const options = declaredOptions.map((option, index) => ({
      id: option.id.startsWith('new-option-') ? undefined : option.id,
      name: option.name.trim(),
      sort_order: index,
      values: option.values.map((value, valueIndex) => ({ id: value.id ?? undefined, value: value.value, sort_order: valueIndex })),
  }))
  const variants = form.variants.map((variant, index) => ({
    id: variant.id ?? undefined,
    name: variant.name,
    // Restated whole: the server takes a submitted variant as its complete
    // state, so omitting these would clear a SKU and switch a disabled variant
    // back on.
    sku: variant.sku,
    active: variant.active,
    sort_order: index,
      // A selection names its option the same way the declaration above does:
      // a saved option by id, one being created by its name.
      option_values: Object.fromEntries(Object.entries(variant.selections)
        .filter(([draftOptionId]) => submittedOptionKeys.has(draftOptionId))
        .map(([draftOptionId, valueKey]) => [submittedOptionKeys.get(draftOptionId)!, valueKey])),
    prices: priceFor(variant),
  }))
  return { options, variants }
}

function catalogShapeOf() {
  return JSON.stringify(buildCatalog())
}

function payload() {
  // Options, variants and prices are restated only when they changed. A save
  // that renames a product says nothing about what it costs, and a patch that
  // omits variants leaves every offer exactly as it is.
  const catalog = buildCatalog()
  // A product being created with only a name says nothing about variants, and
  // the canonical writer gives it its one default variant. An empty list is a
  // claim that it has none, which is not a product.
  const describesCatalog = catalog.variants.length > 0
  const changed = JSON.stringify(catalog) !== loadedCatalogShape.value
  return {
    name: form.name.trim(),
    description: form.description,
    order_url: form.order_url || null,
    tags: form.tags.map(tag => tag.trim()).filter(Boolean),
    ...(changed && describesCatalog ? catalog : {}),
    metafields: form.metafields,
    active: form.active,
  }
}

const { createActionLabel, saveLabel, saveDisabled, save: saveCurrentEditor, startOrCreate } = useCreateWalk({
  recordPath: itemPath,
  isNew,
  openKey: editorKey,
  labels: sectionLabels,
  order: ['name'],
  missing: () => !form.name.trim(),
  noun: presentation.value.itemLabel.toLowerCase(),
  saving,
  existingBlocked: () => !sectionValid.value,
  commit,
})

async function commit() {
  const id = locationId.value
  if (!id) return
  saving.value = true
  saveError.value = null
  try {
    if (isNew.value) {
      const created = await dashboardApi(`/api/editor/organizations/${organizationId}/products`, {
        method: 'POST', body: payload(), validate: isOne,
      })
      // A newly created product is offered here and added to the collection the
      // editor was opened from — both explicit writes, neither implied. The
      // location relationship is not collection membership: without the second
      // write the product was absent from the very collection it was created
      // in.
      await dashboardApi(`/api/editor/organizations/${organizationId}/products/${created.product.id}/locations/${id}`, {
        method: 'PUT', body: { active: true, published: false }, validate: isRecord,
      })
      await addToCollection(created.product.id, id)
      // The record it became, not the `new` form it was, so Back from a saved
      // product goes to the collection and never to an empty Add screen.
      await navigateTo(`${collectionPath.value}/${created.product.id}`, { replace: true })
      return
    }
    await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}`, {
      method: 'PATCH', body: payload(), validate: isOne,
    })
    if (editorKey.value === 'publication') await savePublication(id)
    if (editorKey.value === 'booking') await saveBooking()
    await load({ force: true })
    await level.close()
  } catch (error) {
    saveError.value = getErrorMessage(error, `Failed to save ${presentation.value.itemLabel.toLowerCase()}`)
  } finally {
    saving.value = false
  }
}

/**
 * Put the new product at the end of the collection it was created in.
 *
 * Membership is stated whole — the writer replaces the collection with exactly
 * the ids it is sent — so the current members are read first and the new one
 * appended in their existing order.
 */
async function addToCollection(newProductId: string, locationId: string) {
  if (!collectionId.value) return
  const { products } = await dashboardApi(`/api/editor/organizations/${organizationId}/locations/${locationId}/products`, { validate: isProductList })
  const members = products
    .flatMap(row => row.collections
      .filter(entry => entry.collection_id === collectionId.value)
      .map(entry => ({ id: row.id, sort_order: entry.sort_order })))
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(entry => entry.id)
  await dashboardApi(`/api/editor/organizations/${organizationId}/collections/${collectionId.value}/products`, {
    method: 'PUT',
    body: { product_ids: [...members.filter(memberId => memberId !== newProductId), newProductId] },
    validate: isRecord,
  })
}

/** Three switches, three writes. None of them implies another. */
async function savePublication(id: string) {
  await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/publication`, {
    method: 'PUT', body: { published: form.published }, validate: isRecord,
  })
  await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/locations/${id}`, {
    method: 'PUT', body: { active: form.location_active, published: form.location_published }, validate: isRecord,
  })
}

/**
 * Write the capability the merchant is looking at.
 *
 * Unticking the box used to return here and let the save report success while
 * the product stayed bookable. Removing the capability takes the schedule with
 * it, so the writer refuses while anything is booked and says so.
 */
async function saveBooking() {
  if (!form.bookable) {
    if (!product.value?.booking) return
    await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/booking`, {
      method: 'DELETE', validate: isRecord,
    })
    return
  }
  await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/booking`, {
    method: 'PUT',
    body: {
      duration_minutes: Number(form.booking_duration) || null,
      default_capacity: form.booking_capacity.trim() ? Number(form.booking_capacity) : null,
    },
    validate: isRecord,
  })
  // The schedule is saved with the capability it belongs to. A product that
  // has just become bookable has no schedule loaded yet, and none to save.
  await saveSchedule()
}

// ── The weekly schedule ─────────────────────────────────
// One draft slot per (weekday, time) at this branch. Capacity is kept as the
// merchant typed it and read as a number, or the product's default, on save.
interface ScheduleSlotDraft { weekday: number; start_time: string; capacity: string }
const WEEKDAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }, { value: 0, label: 'Sunday' },
]
const schedule = ref<ScheduleSlotDraft[]>([])
const scheduleLoading = ref(false)
const scheduleLoadedFor = ref<string | null>(null)
const isRuleList = (value: unknown): value is { success: true; rules: Array<{ weekday: number; start_time: string; capacity: number | null }> } =>
  isRecord(value) && Array.isArray(value.rules)

function slotsFor(weekday: number) {
  return schedule.value.filter(slot => slot.weekday === weekday)
}
function addSlot(weekday: number) {
  schedule.value.push({ weekday, start_time: '', capacity: '' })
}
function removeSlot(slot: ScheduleSlotDraft) {
  schedule.value = schedule.value.filter(entry => entry !== slot)
}

async function loadSchedule() {
  const id = locationId.value
  if (!id || !product.value?.booking) return
  const key = `${productId.value}:${id}`
  if (scheduleLoadedFor.value === key) return
  scheduleLoading.value = true
  try {
    const { rules } = await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/availability?location_id=${encodeURIComponent(id)}`, { validate: isRuleList })
    // The reader moved on while this loaded; that location's own load owns the draft.
    if (`${productId.value}:${locationId.value}` !== key) return
    schedule.value = rules.map(rule => ({ weekday: rule.weekday, start_time: rule.start_time, capacity: rule.capacity === null ? '' : String(rule.capacity) }))
    scheduleLoadedFor.value = key
  } finally {
    scheduleLoading.value = false
  }
}
watch([editorKey, product, locationId], ([key]) => { if (key === 'booking') void loadSchedule() }, { immediate: true })

/** The schedule as the writer takes it: every filled slot, capacity as a number or the default. */
async function saveSchedule() {
  const id = locationId.value
  if (!id || scheduleLoadedFor.value !== `${productId.value}:${id}`) return
  const slots = schedule.value
    .filter(slot => slot.start_time.trim())
    .map(slot => ({ weekday: slot.weekday, start_time: slot.start_time.trim().slice(0, 5), capacity: slot.capacity.trim() ? Number(slot.capacity) : null }))
  await dashboardApi(`/api/editor/organizations/${organizationId}/products/${productId.value}/availability`, {
    method: 'PUT', body: { location_id: id, slots }, validate: isRecord,
  })
  scheduleLoadedFor.value = null
}

/** A cancelled leaf puts the loaded product back before it closes. */
function revert() {
  saveError.value = null
  photoError.value = null
  if (product.value) loadForm(product.value)
  // The schedule draft goes with the form: reopening Bookings reloads the saved rules.
  scheduleLoadedFor.value = null
}

async function setPrimaryImage(assetId: string | null) {
  photoError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/media/placements`, {
      method: 'PUT',
      body: { placement: { owner_type: 'product', owner_id: productId.value, slot: 'image' }, asset_id: assetId },
      validate: isRecord,
    })
    form.image_asset_id = assetId
    await load({ force: true })
  } catch (error) {
    photoError.value = getErrorMessage(error, 'Failed to update the photo')
  }
}

// ── Localization ────────────────────────────────────────
/**
 * Which fields can be translated comes from the tenant's own definitions, so
 * adding an attribute makes it translatable without an edit here.
 */
const productLocalizationFields = computed(() => {
  const row = product.value
  const fields: Array<{ key: string, label: string, source: string | readonly string[] | null | undefined, kind?: 'string-list', multiline?: boolean, rows?: number }> = [
    { key: 'name', label: 'Name', source: row?.name },
    { key: 'description', label: 'Description', source: row?.description, multiline: true, rows: 4 },
    { key: 'tags', label: 'Tags', source: row?.tags, kind: 'string-list' },
  ]
  for (const definition of definitions.value) {
    if (!definition.localizable) continue
    const handle = metafieldHandle(definition)
    const value = row?.metafields[handle]
    fields.push({
      key: `metafield:${handle}`,
      label: definition.name,
      source: Array.isArray(value) ? value : typeof value === 'string' ? value : null,
      kind: Array.isArray(value) ? 'string-list' : undefined,
      multiline: definition.value_type === 'multi_line_text',
    })
  }
  return fields
})

const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/settings/localization`)

function isProductLocalizationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}

async function loadProductLocalization(locale: string): Promise<Record<string, unknown>> {
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/organizations/${organizationId}/localization/product/${productId.value}/${encodeURIComponent(locale)}`,
      { validate: isProductLocalizationResponse },
    )
    const values = { ...response.localization.values }
    const metafields = isRecord(values.metafields) ? values.metafields : {}
    for (const [handle, value] of Object.entries(metafields)) values[`metafield:${handle}`] = value
    delete values.metafields
    return values
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode === 404) return {}
    throw cause
  }
}

async function saveProductLocalization(locale: string, submitted: Record<string, unknown>): Promise<void> {
  const row = product.value
  if (!row) throw new Error(`The ${presentation.value.itemLabel.toLowerCase()} is unavailable.`)
  const values: Record<string, unknown> = {}
  for (const key of ['name', 'description', 'tags']) {
    if (Object.hasOwn(submitted, key)) values[key] = submitted[key]
  }
  const metafields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(submitted)) {
    if (key.startsWith('metafield:')) metafields[key.slice('metafield:'.length)] = value
  }
  if (Object.keys(metafields).length) values.metafields = metafields
  await dashboardApi(`/api/editor/organizations/${organizationId}/localization/product/${row.id}/${encodeURIComponent(locale)}`, {
    method: 'PUT',
    body: { values },
    validate: isProductLocalizationResponse,
  })
}

useSeoMeta({ title: () => `${form.name || presentation.value.itemLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })
provide(productEditorKey, {
  form,
  product,
  presentation,
  currency,
  organizationId,
  locationId,
  definitions,
  isNew,
  sectionLabels,
  saving,
  saveError,
  photoError,
  saveLabel,
  saveDisabled,
  setPrimaryImage,
  addOption,
  removeOption,
  setOptionValues,
  metafieldKey,
  listValue,
  textValue,
  integerValue,
  setIntegerMetafield,
  booleanValue,
  weekdays: WEEKDAYS,
  scheduleLoading,
  slotsFor,
  addSlot,
  removeSlot,
  revert,
  save: saveCurrentEditor,
})
</script>

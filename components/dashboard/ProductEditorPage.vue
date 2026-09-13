<template>
  <!--
    With no section open this item is its parent's detail column, so it renders
    its rows and nothing else — no panel, no navbar, and no section opened on
    its behalf. It becomes the index column only once a section is open.
  -->
  <div v-if="frame.mode.value === 'index'">
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
      <EditorNavigationList :groups="navigationGroups" />
    </template>
  </div>

  <UDashboardPanel v-else id="location-product-detail">
    <template #header>
      <UDashboardNavbar :title="form.name || presentation.itemLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="collectionPath" :label="collection?.name ?? presentation.collectionLabel" />
        </template>
        <template v-if="product" #right>
          <DashboardResourceLocalization
            :site-id="siteId"
            resource-type="product"
            :resource-id="productId"
            :resource-label="presentation.itemLabel.toLowerCase()"
            :fields="productLocalizationFields"
            :load-values="loadProductLocalization"
            :save-values="saveProductLocalization"
            :language-settings-path="siteLocalizationSettingsPath"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="`${presentation.itemLabel} could not be loaded`"
        :description="loadError"
      />

      <EditorPaneShell
        v-else
        has-detail
        :show-actions="editorKey !== 'photo'"
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        :detail-title="sectionLabels[editorKey]"
        :dismiss-to="itemPath"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="detailKey" />
        </template>

        <template #detail>
          <!-- Photo -->
          <div v-if="editorKey === 'photo'" class="space-y-4">
            <p class="text-base text-muted">The picture guests recognise this by, in the list and on your site.</p>
            <DashboardCoverPhotoField
              :site-id="siteId"
              :location-id="locationId"
              :model-value="form.image_asset_id"
              :preview-url="product?.image?.public_url ?? null"
              :preview-alt="product?.image?.alt_text || form.name"
              :title="`${presentation.itemLabel} photo`"
              testid="product-photo"
              @update:model-value="setPrimaryImage"
            />
            <p class="text-sm text-muted">A photo saves as soon as you choose it.</p>
          </div>

          <!-- Name -->
          <UFormField v-else-if="editorKey === 'name'" label="Name" required>
            <UInput v-model="form.name" size="xl" autofocus class="w-full" />
          </UFormField>

          <!--
            One price, on the one thing being bought. A product with options has
            a price per option combination, so this section hands over to
            Options rather than quietly editing whichever variant came first.
          -->
          <div v-else-if="editorKey === 'price'" class="space-y-5">
            <template v-if="form.variants.length === 1">
              <UFormField :label="`Amount (${currency})`" description="Leave empty if this is not purchasable. Zero is a real price and means free.">
                <UInput v-model="form.variants[0]!.price_major" inputmode="decimal" placeholder="280" class="w-full" data-testid="product-price" />
              </UFormField>
            </template>
            <UAlert
              v-else
              color="neutral"
              variant="soft"
              icon="i-lucide-list"
              title="This has options"
              :description="`Each combination has its own price. Edit them under Options.`"
            />
          </div>

          <!-- Description -->
          <UFormField v-else-if="editorKey === 'description'" label="Description">
            <UTextarea v-model="form.description" :rows="10" autofocus class="w-full" />
          </UFormField>

          <!--
            Options and the combinations they produce. A combination is what a
            customer actually buys, so it is what carries a price — and every
            combination has to be answered, or two of them look identical.
          -->
          <div v-else-if="editorKey === 'options'" class="space-y-6">
            <div v-for="(option, optionIndex) in form.options" :key="option.id" class="space-y-2 rounded-lg border border-default p-3">
              <div class="flex items-center gap-2">
                <UInput v-model="option.name" placeholder="Size" :maxlength="PRODUCT_LIMITS.optionName" class="flex-1" aria-label="Option name" />
                <UButton
                  icon="i-lucide-trash-2" color="neutral" variant="ghost"
                  :aria-label="`Remove ${option.name || 'option'}`"
                  @click="removeOption(optionIndex)"
                />
              </div>
              <UInputTags
                :model-value="option.values.map(value => value.value)"
                placeholder="Add a value"
                :max="PRODUCT_LIMITS.optionValues"
                :max-length="PRODUCT_LIMITS.optionValue"
                delimiter=","
                add-on-blur
                add-on-paste
                class="w-full"
                @update:model-value="setOptionValues(optionIndex, $event as string[])"
              />
            </div>
            <UButton
              v-if="form.options.length < PRODUCT_LIMITS.options"
              label="Add an option" icon="i-lucide-plus" color="neutral" variant="soft"
              @click="addOption"
            />

            <div v-if="form.variants.length > 1" class="space-y-2">
              <p class="text-sm font-semibold text-highlighted">Combinations</p>
              <div v-for="variant in form.variants" :key="variant.key" class="flex items-center gap-3 rounded-lg border border-default p-3">
                <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ variant.name }}</span>
                <UInput v-model="variant.price_major" inputmode="decimal" :placeholder="`Amount (${currency})`" class="w-40" />
              </div>
            </div>
          </div>

          <!-- Order link -->
          <UFormField v-else-if="editorKey === 'order-url'" label="Order URL" description="Where a customer goes to order this. Not the page it is shown on.">
            <UInput v-model="form.order_url" type="url" placeholder="https://…" class="w-full" />
          </UFormField>

          <!-- Tags -->
          <UFormField v-else-if="editorKey === 'tags'" label="Tags">
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
            Attributes are your own defined facts — allergens, what to bring,
            a cancellation policy. Each one is a definition you made once, so
            the same attribute means the same thing on every product.
          -->
          <div v-else-if="editorKey === 'attributes'" class="space-y-3">
            <p v-if="!definitions.length" class="text-base text-muted">
              No attributes are defined yet. Define one in your catalog settings and it becomes available on every {{ presentation.itemLabel.toLowerCase() }}.
            </p>
            <UFormField
              v-for="definition in definitions"
              :key="definition.id"
              :label="definition.name"
              :description="definition.description ?? undefined"
            >
              <UInputTags
                v-if="definition.value_type === 'list.single_line_text'"
                :model-value="listValue(definition)"
                placeholder="Add a value"
                delimiter=","
                add-on-blur
                add-on-paste
                class="w-full"
                @update:model-value="form.metafields[metafieldKey(definition)] = $event as string[]"
              />
              <UTextarea
                v-else-if="definition.value_type === 'multi_line_text'"
                :model-value="textValue(definition)"
                :rows="4"
                class="w-full"
                @update:model-value="form.metafields[metafieldKey(definition)] = $event"
              />
              <!-- A typed attribute is edited in its own type. A number typed
                   into a text box arrives as a string the validator refuses,
                   and a boolean has no text form at all. -->
              <UInputNumber
                v-else-if="definition.value_type === 'integer'"
                :model-value="integerValue(definition)"
                class="w-full"
                @update:model-value="setIntegerMetafield(definition, $event)"
              />
              <UCheckbox
                v-else-if="definition.value_type === 'boolean'"
                :model-value="booleanValue(definition)"
                :label="definition.name"
                @update:model-value="form.metafields[metafieldKey(definition)] = $event === true"
              />
              <UInput
                v-else
                :model-value="textValue(definition)"
                class="w-full"
                @update:model-value="form.metafields[metafieldKey(definition)] = $event"
              />
            </UFormField>
          </div>

          <!--
            Three separate switches, because they answer three different
            questions. Turning off the sale switch does not hide the item, and
            hiding it does not say it is sold out.
          -->
          <div v-else-if="editorKey === 'publication'" class="space-y-4">
            <UCheckbox v-model="form.active" label="On sale" description="The merchant switch. Off means you are not selling it anywhere." />
            <UCheckbox v-model="form.published" label="Published on this site" description="Whether the site shows it at all." />
            <UCheckbox v-model="form.location_published" label="Shown at this location" description="Whether this branch lists it." />
            <UCheckbox v-model="form.location_active" label="Sold at this location" description="Whether this branch takes orders for it." />
          </div>

          <!--
            Booking capability. Adding it is what makes this bookable; removing
            it takes its sessions and their bookings with it, so it asks first.
          -->
          <div v-else-if="editorKey === 'booking'" class="space-y-4">
            <UCheckbox v-model="form.bookable" label="Takes bookings" description="Guests choose a session and reserve a place." />
            <UAlert
              v-if="!form.bookable && product?.booking"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              description="Saving removes this product's schedule. It is refused while anything is booked."
            />
            <template v-if="form.bookable">
              <UFormField label="Session length (minutes)">
                <UInput v-model="form.booking_duration" inputmode="numeric" placeholder="120" class="w-full" />
              </UFormField>
              <UFormField label="Places per session" description="Leave empty for no limit. Zero means no places at all.">
                <UInput v-model="form.booking_capacity" inputmode="numeric" placeholder="10" class="w-full" />
              </UFormField>

              <!--
                The weekly schedule at this branch. Each time is a slot the
                merchant runs every week; sessions a guest can book are
                generated from these, so this is where a class time is added,
                moved or dropped.
              -->
              <div v-if="product?.booking" class="space-y-3 border-t border-default pt-4">
                <div>
                  <p class="text-sm font-medium">Weekly schedule</p>
                  <p class="text-sm text-muted">Times this branch runs it, in the branch's own clock. Dropping a time cancels its future sessions that nobody has booked.</p>
                </div>
                <p v-if="scheduleLoading" class="text-sm text-muted">Loading the schedule…</p>
                <div v-else class="space-y-3">
                  <div v-for="day in WEEKDAYS" :key="day.value" class="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <p class="w-24 shrink-0 pt-2 text-sm font-medium">{{ day.label }}</p>
                    <div class="flex-1 space-y-2">
                      <div v-for="(slot, index) in slotsFor(day.value)" :key="`${day.value}-${index}`" class="flex items-center gap-2">
                        <UInput v-model="slot.start_time" type="time" step="300" class="w-32" />
                        <UInput v-model="slot.capacity" inputmode="numeric" :placeholder="form.booking_capacity || 'Default'" class="w-28" aria-label="Places for this time" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Remove this time" @click="removeSlot(slot)" />
                      </div>
                      <UButton icon="i-lucide-plus" color="neutral" variant="subtle" size="sm" label="Add a time" @click="addSlot(day.value)" />
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardCoverPhotoField from '~/components/dashboard/DashboardCoverPhotoField.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import type { Collection, Product } from '~/server/types/products'
import type { MetafieldDefinition, MetafieldValue } from '~/shared/metafields'
import { metafieldHandle } from '~/shared/metafields'
import { PRODUCT_LIMITS } from '~/shared/product-limits'
import { isCurrencyCode } from '~/shared/currencies'
import { majorAmountToMinor, minorAmountToMajor, selectPrice, type Price } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'
import { presentationForProduct, requireProductPresentation } from '~/utils/product-presentation'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

const route = useRoute()
const dashboardApi = useDashboardApi()
const toast = useToast()
const collectionId = computed(() => String(route.params.collectionId ?? route.params.categoryId ?? ''))
const productId = computed(() => String(route.params.productId ?? ''))
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const collectionPath = computed(() => `${productsPath.value}/${collectionId.value}`)
const itemPath = computed(() => `${collectionPath.value}/${productId.value}`)
const frame = useEditorFrame(itemPath)

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// The words follow the product: a class is an experience whatever the site
// sells otherwise. Until the row has loaded, and for a product being created,
// the screen speaks the vertical's own surface — it is not yet known to be
// anything else.
const presentation = computed(() => (product.value ? presentationForProduct(vertical, product.value) : requireProductPresentation(vertical)))
const rawCurrency = dashboard.site.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported site currency' })
const currency = rawCurrency

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)

// ── Which leaf is open ──────────────────────────────────
const SECTION_KEYS = ['photo', 'name', 'price', 'description', 'options', 'order-url', 'tags', 'attributes', 'publication', 'booking'] as const
type SectionKey = typeof SECTION_KEYS[number]

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

const detailKey = computed(() => frame.childSegment.value)
const editorKey = computed<SectionKey>(() => (detailKey.value ?? 'photo') as SectionKey)

const NEW_SECTION_KEYS: readonly SectionKey[] = ['name']
const isNew = computed(() => productId.value === 'new')
const openSections = computed<readonly SectionKey[]>(() => (isNew.value ? NEW_SECTION_KEYS : SECTION_KEYS))

if (frame.rest.value.length > 1 || (detailKey.value && !openSections.value.some(key => key === detailKey.value))) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

// ── Load ────────────────────────────────────────────────
const collections = ref<Collection[]>([])
const definitions = ref<MetafieldDefinition[]>([])
const product = ref<Product | null>(null)
const loadError = ref<string | null>(null)
const saving = ref(false)

const isCollectionList = (value: unknown): value is { collections: Collection[] } =>
  isRecord(value) && Array.isArray(value.collections)
const isDefinitionList = (value: unknown): value is { definitions: MetafieldDefinition[] } =>
  isRecord(value) && Array.isArray(value.definitions)
const isProductList = (value: unknown): value is { success: true, products: Product[] } =>
  isRecord(value) && Array.isArray(value.products)
const isOne = (value: unknown): value is { success: true, product: Product } =>
  isRecord(value) && isRecord(value.product)

const collection = computed(() => collections.value.find(row => row.id === collectionId.value) ?? null)

async function load() {
  const id = locationId.value
  if (!id || isNew.value) {
    if (!isNew.value) return
    // A new item still needs the attribute vocabulary to render its form.
    definitions.value = (await dashboardApi(`/api/editor/sites/${siteId}/metafield-definitions`, { validate: isDefinitionList })).definitions
    return
  }
  loadError.value = null
  try {
    const [collectionResponse, productResponse, definitionResponse] = await Promise.all([
      dashboardApi(`/api/editor/sites/${siteId}/collections?location_id=${encodeURIComponent(id)}`, { validate: isCollectionList }),
      dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products`, { validate: isProductList }),
      dashboardApi(`/api/editor/sites/${siteId}/metafield-definitions`, { validate: isDefinitionList }),
    ])
    collections.value = collectionResponse.collections
    definitions.value = definitionResponse.definitions
    const found = productResponse.products.find(row => row.id === productId.value)
    if (!found) return showError(createError({ statusCode: 404, statusMessage: `${presentation.value.itemLabel} not found` }))
    product.value = found
    loadForm(found)
  } catch (error) {
    if (isNotFoundError(error)) return showError(createError({ statusCode: 404, statusMessage: `${presentation.value.itemLabel} not found` }))
    loadError.value = getErrorMessage(error, `Failed to load this ${presentation.value.itemLabel.toLowerCase()}`)
  }
}

onMounted(load)
watch(locationId, load)

// ── The form ────────────────────────────────────────────
interface OptionValueDraft { id: string | null; value: string }
interface OptionDraft { id: string; name: string; values: OptionValueDraft[] }
interface VariantDraft {
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

const form = reactive({
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
  form.published = row.publications.find(entry => entry.site_id === siteId)?.published ?? false
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

// ── The hub ─────────────────────────────────────────────
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
  return formatProductMoney(price) ?? 'No price set'
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
    items: [{ id: 'loading', label: 'Loading', summary: `Loading this ${presentation.value.itemLabel.toLowerCase()}…`, placeholder: true, to: itemPath.value }],
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
          previews: image?.thumbnail_url || image?.public_url ? [String(image.thumbnail_url ?? image.public_url)] : undefined,
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
  try {
    if (isNew.value) {
      const created = await dashboardApi(`/api/editor/sites/${siteId}/products`, {
        method: 'POST', body: payload(), validate: isOne,
      })
      // A newly created product is offered here and added to the collection the
      // editor was opened from — both explicit writes, neither implied. The
      // location relationship is not collection membership: without the second
      // write the product was absent from the very collection it was created
      // in.
      await dashboardApi(`/api/editor/sites/${siteId}/products/${created.product.id}/locations/${id}`, {
        method: 'PUT', body: { active: true, published: false }, validate: isRecord,
      })
      await addToCollection(created.product.id, id)
      await navigateTo(`${collectionPath.value}/${created.product.id}`)
      return
    }
    await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}`, {
      method: 'PATCH', body: payload(), validate: isOne,
    })
    if (editorKey.value === 'publication') await savePublication(id)
    if (editorKey.value === 'booking') await saveBooking()
    await load()
    await navigateTo(itemPath.value)
  } catch (error) {
    toast.add({ description: getErrorMessage(error, `Failed to save ${presentation.value.itemLabel.toLowerCase()}`), color: 'error' })
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
  const { products } = await dashboardApi(`/api/editor/sites/${siteId}/locations/${locationId}/products`, { validate: isProductList })
  const members = products
    .flatMap(row => row.collections
      .filter(entry => entry.collection_id === collectionId.value)
      .map(entry => ({ id: row.id, sort_order: entry.sort_order })))
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(entry => entry.id)
  await dashboardApi(`/api/editor/sites/${siteId}/collections/${collectionId.value}/products`, {
    method: 'PUT',
    body: { product_ids: [...members.filter(memberId => memberId !== newProductId), newProductId] },
    validate: isRecord,
  })
}

/** Three switches, three writes. None of them implies another. */
async function savePublication(id: string) {
  await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/publication`, {
    method: 'PUT', body: { published: form.published }, validate: isRecord,
  })
  await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/locations/${id}`, {
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
    await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/booking`, {
      method: 'DELETE', validate: isRecord,
    })
    return
  }
  await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/booking`, {
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
    const { rules } = await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/availability?location_id=${encodeURIComponent(id)}`, { validate: isRuleList })
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
  await dashboardApi(`/api/editor/sites/${siteId}/products/${productId.value}/availability`, {
    method: 'PUT', body: { location_id: id, slots }, validate: isRecord,
  })
  scheduleLoadedFor.value = null
}

async function cancelEditor() {
  if (product.value) loadForm(product.value)
  await navigateTo(itemPath.value)
}

async function setPrimaryImage(assetId: string | null) {
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/media/placements`, {
      method: 'PUT',
      body: { placement: { owner_type: 'product', owner_id: productId.value, slot: 'image' }, asset_id: assetId },
      validate: isRecord,
    })
    form.image_asset_id = assetId
    await load()
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to update the photo'), color: 'error' })
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

const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)

function isProductLocalizationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}

async function loadProductLocalization(locale: string): Promise<Record<string, unknown>> {
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/product/${productId.value}/${encodeURIComponent(locale)}`,
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
  await dashboardApi(`/api/editor/sites/${siteId}/localization/product/${row.id}/${encodeURIComponent(locale)}`, {
    method: 'PUT',
    body: { values },
    validate: isProductLocalizationResponse,
  })
}

useSeoMeta({ title: () => `${form.name || presentation.value.itemLabel} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })
</script>

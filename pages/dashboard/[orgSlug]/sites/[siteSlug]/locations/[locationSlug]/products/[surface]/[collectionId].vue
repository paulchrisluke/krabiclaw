<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <template v-else>
    <!--
      The list column. Creating a category is this page's own level, so it draws
      the panel; an existing category's list owns its panel itself, and is
      hidden below `lg` while a leaf or an item takes the screen.
    -->
    <UDashboardPanel
      v-if="isNew"
      id="location-product-category"
      :class="openLeaf ? 'hidden lg:flex' : undefined"
      :default-size="openLeaf ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar :title="`New ${presentation.collectionGroupLabel.toLowerCase()}`" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="openLeaf ? 'max-w-xl' : 'max-w-3xl'">
          <div class="mb-6 flex justify-end">
            <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
          </div>
          <EditorNavigationList :groups="collectionNavigation" :active-item="openLeaf" />
        </div>
      </template>
    </UDashboardPanel>
    <CollectionProductList
      v-else
      :class="hasColumnBeside ? 'hidden lg:flex' : undefined"
      :default-size="hasColumnBeside ? 32 : undefined"
    />

    <!-- The category's Name leaf: the record itself, so this page owns the field. -->
    <UDashboardPanel v-if="openLeaf" id="location-product-category-name">
      <template #header>
        <UDashboardNavbar :title="COLLECTION_LABELS.name" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-2xl">
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <UFormField label="Name" required>
            <UInput v-model="form.name" :placeholder="presentation.collectionGroupLabel === 'Section' ? 'Appetizers' : 'Accessories'" size="xl" autofocus class="w-full" />
          </UFormField>
          <DashboardResourceLocalization
            v-if="!isNew"
            class="mt-6"
            :site-id="siteId"
            resource-type="collection"
            :resource-id="collectionId"
            :resource-label="presentation.collectionGroupLabel.toLowerCase()"
            :fields="collectionLocalizationFields"
            :language-settings-path="siteLocalizationSettingsPath"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex shrink-0 items-center justify-between gap-4 border-t border-default px-4 py-3 sm:px-6">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="closeLeaf" />
          <UButton :label="saveLabel || 'Save'" :loading="saving" :disabled="saveDisabled" @click="saveLeaf" />
        </div>
      </template>
    </UDashboardPanel>

    <!-- An item is open: it owns the other column, header and all. -->
    <NuxtPage v-else-if="frame.mode.value === 'pair'" />
  </template>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import CollectionProductList from '~/components/dashboard/CollectionProductList.vue'
import { getErrorMessage } from '~/utils/errors'
import { isCatalogSurface, presentationForSurface } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const collectionId = computed(() => String(route.params.collectionId ?? ''))

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// A segment that names no surface of this vertical is not a page, and neither
// is a collection reached through one.
const segment = String(route.params.surface ?? '')
if (!isCatalogSurface(vertical, segment)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const surface = segment
// The surface owns the words at this level: a collection of bookable products
// is a Collection of Experiences, a section of a menu holds dishes.
const presentation = presentationForSurface(vertical, surface)

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const surfacePath = computed(() => `${locationPath.value}/products/${surface}`)
const collectionPath = computed(() => `${surfacePath.value}/${collectionId.value}`)
const frame = useEditorFrame(collectionPath)

const siteId = await useDashboardSiteId()

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)

// The same catalog the list reads, so the Name leaf's draft costs no request.
const catalog = useLocationProductCatalog(siteId, locationId)
const collection = computed(() => catalog.collections.value.find(row => row.id === collectionId.value) ?? null)

// ── The collection record ───────────────────────────────
const isNew = computed(() => collectionId.value === 'new')
const COLLECTION_LABELS = { name: 'Name' } as const
type CollectionLeaf = keyof typeof COLLECTION_LABELS
/** The collection's own leaf, as opposed to a product open beneath it. */
const openLeaf = computed<CollectionLeaf | null>(() => (frame.childSegment.value === 'name' ? 'name' : null))
const openKey = computed<CollectionLeaf>(() => openLeaf.value ?? 'name')
/** Something takes the screen beside the list: the Name leaf, or an open item. */
const hasColumnBeside = computed(() => Boolean(openLeaf.value) || frame.mode.value === 'pair')

watchEffect(() => {
  if (isNew.value && (frame.rest.value.length > 1 || (frame.childSegment.value && !openLeaf.value))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

// One draft, so it survives the remount between this collection's sections. The
// key cannot carry the collection id — it is read once at setup while Nuxt
// reuses this page across collections — so the watch below re-seeds it instead.
const form = useState(`collection-draft-${siteId}`, () => ({ name: '' })).value
watch(collection, (row) => { if (row) form.name = row.name }, { immediate: true })
// Nuxt reuses this page across collections; a record that has not arrived leaves nothing behind.
watch(collectionId, () => { form.name = collection.value?.name ?? '' })

const saving = ref(false)
const errorMessage = ref('')

const collectionNavigation = computed<EditorNavigationGroup[]>(() => [{
  id: 'collection',
  items: [{ id: 'name', label: 'Name', summary: form.name.trim() || 'Not named yet', placeholder: !form.name.trim(), to: `${collectionPath.value}/name` }],
}])
const collectionLocalizationFields = computed(() => [{ key: 'name', label: 'Name', source: collection.value?.name }])
const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)

const { createActionLabel, saveLabel, saveDisabled, save: saveLeaf, startOrCreate } = useCreateWalk({
  recordPath: collectionPath,
  isNew,
  openKey,
  labels: COLLECTION_LABELS,
  order: ['name'],
  missing: () => !form.name.trim(),
  noun: presentation.collectionGroupLabel.toLowerCase(),
  saving,
  commit,
})

const isCollectionCreated = (value: unknown): value is { collection: { id: string } } =>
  isRecord(value) && isRecord(value.collection) && typeof value.collection.id === 'string'

async function commit() {
  saving.value = true
  errorMessage.value = ''
  let createdId: string | null = null
  try {
    // A collection created from a location's screen is scoped to that
    // location; a site-wide one is created from the site's own catalog screen.
    // Renaming one needs no location at all, so only the create asks for it —
    // and says so rather than returning quietly and leaving Save looking done.
    const endpoint = `/api/editor/sites/${siteId}/collections`
    if (isNew.value) {
      const location = locationId.value
      if (!location) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
      const created = await dashboardApi(endpoint, { method: 'POST', body: { name: form.name.trim(), location_id: location }, validate: isCollectionCreated })
      createdId = created.collection.id
    } else {
      await dashboardApi(`${endpoint}/${collectionId.value}`, { method: 'PATCH', body: { name: form.name.trim() }, validate: isRecord })
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error, `Failed to save ${presentation.collectionGroupLabel.toLowerCase()}`)
    return
  } finally {
    saving.value = false
  }
  // The write has landed. Everything below only moves the screen onto it, and a
  // failure here is not a failed save — saying it was would leave the create
  // screen open over a collection that exists, and the next press would make a
  // second one with the same name.
  if (createdId) form.name = ''
  await catalog.refresh()
  await navigateTo(createdId ? `${surfacePath.value}/${createdId}` : collectionPath.value)
}

function closeLeaf() {
  errorMessage.value = ''
  if (collection.value) form.name = collection.value.name
  void navigateTo(collectionPath.value)
}
</script>

<template>
  <!--
    An existing collection is its list of products; one being created has only
    its name to give. Either way the level below is a leaf or a product.
  -->
  <CollectionProductList v-if="!isNew" />
  <DashboardIndexPanel v-else id="location-product-category" :title="`New ${presentation.collectionGroupLabel.toLowerCase()}`" :auto-open="collectionNavigation[0]?.items.find(item => item.to)?.to ?? null">
    <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
    <div class="mb-6 flex justify-end">
      <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
    </div>
    <EditorNavigationList :groups="collectionNavigation" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'

/** The collection's one field and the walk that creates it. */
export interface CollectionEditor {
  form: { name: string }
  isNew: ComputedRef<boolean>
  collectionId: ComputedRef<string>
  siteId: string
  groupLabel: string
  hasRecord: ComputedRef<boolean>
  saving: Ref<boolean>
  errorMessage: Ref<string>
  saveLabel: Ref<string | undefined>
  saveDisabled: Ref<boolean>
  localizationFields: ComputedRef<Array<{ key: string; label: string; source: string | null | undefined }>>
  siteLocalizationSettingsPath: ComputedRef<string>
  revert: () => void
  save: () => Promise<void>
}

export const collectionEditorKey = Symbol('collection-editor') as InjectionKey<CollectionEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import CollectionProductList from '~/components/dashboard/CollectionProductList.vue'
import { getErrorMessage } from '~/utils/errors'
import { presentationForSurface } from '~/utils/product-presentation'
import type { ProductSurface } from '~/server/types/products'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const collectionId = computed(() => String(route.params.collectionId ?? ''))

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
// `[surface].vue` renders nothing below it for a segment that names no surface
// of this vertical, so this level is only ever reached through a real one.
const surface = String(route.params.surface ?? '') as ProductSurface
// The surface owns the words at this level: a collection of bookable products
// is a Collection of Experiences, a section of a menu holds dishes.
const presentation = presentationForSurface(vertical, surface)

const level = useRouteLevel()
const collectionPath = level.path

const siteId = await useDashboardSiteId()

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)

// The same catalog the list reads, so the Name leaf's draft costs no request.
const catalog = useLocationProductCatalog(siteId, locationId)
const collection = computed(() => catalog.collections.value.find(row => row.id === collectionId.value) ?? null)

// ── The collection record ───────────────────────────────
const isNew = computed(() => collectionId.value === 'new')
const COLLECTION_LABELS = { name: 'Name' } as const
type CollectionLeaf = keyof typeof COLLECTION_LABELS
const openKey = computed<CollectionLeaf>(() => 'name')

// A collection being created has one leaf; anything else below it is not a page.
watchEffect(() => {
  if (isNew.value && level.child.value && level.child.value !== 'name') {
    showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
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
  // The record it became, not the `new` form it was, so Back from a saved
  // collection goes to the surface and never to an empty Add screen.
  if (createdId) await navigateTo(`${level.to.value}/${createdId}`, { replace: true })
  else await level.close()
}

/** A cancelled leaf puts the stored name back before it closes. */
function revert() {
  errorMessage.value = ''
  if (collection.value) form.name = collection.value.name
}

provide(collectionEditorKey, {
  form,
  isNew,
  collectionId,
  siteId,
  groupLabel: presentation.collectionGroupLabel,
  hasRecord: computed(() => Boolean(collection.value)),
  saving,
  errorMessage,
  saveLabel,
  saveDisabled,
  localizationFields: collectionLocalizationFields,
  siteLocalizationSettingsPath,
  revert,
  save: saveLeaf,
})
</script>

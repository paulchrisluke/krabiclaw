<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    The category's own level: creating one at `new`, or its Name leaf. Both are
    the category record, so this page owns the chrome and the field.
  -->
  <UDashboardPanel v-else-if="isNew || openLeaf" id="location-product-category" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="isNew ? `New ${presentation.collectionGroupLabel.toLowerCase()}` : collectionName" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="productsPath" :label="presentation.collectionLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="Boolean(openLeaf)"
        :detail-title="COLLECTION_LABELS.name"
        :dismiss-to="collectionPath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="closeLeaf"
        @save="saveLeaf"
      >
        <template #index>
          <UAlert v-if="errorMessage" class="mb-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <template v-if="isNew">
            <div class="mb-6 flex justify-end">
              <UButton :label="createActionLabel" :loading="saving" @click="startOrCreate" />
            </div>
            <EditorNavigationList :groups="collectionNavigation" :active-item="openLeaf" />
          </template>
          <CollectionProductList v-else />
        </template>
        <template #detail>
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
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <!-- An item is open: my list is the index column, the item is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-product-category">
    <template #header>
      <UDashboardNavbar :title="collectionName" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="productsPath" :label="presentation.collectionLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="collectionPath"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <CollectionProductList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <CollectionProductList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import CollectionProductList from '~/components/dashboard/CollectionProductList.vue'
import { getErrorMessage } from '~/utils/errors'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const route = useRoute()
const toast = useToast()
const dashboardApi = useDashboardApi()
const collectionId = computed(() => String(route.params.collectionId ?? ''))
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const collectionPath = computed(() => `${productsPath.value}/${collectionId.value}`)
const frame = useEditorFrame(collectionPath)

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
const presentation = requireProductPresentation(vertical)

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)

// The same catalog the two lists read, so titling this column costs no request.
const catalog = useLocationProductCatalog(siteId, locationId)
const collection = computed(() => catalog.collections.value.find(row => row.id === collectionId.value) ?? null)
const collectionName = computed(() => collection.value?.name ?? presentation.collectionLabel)

// ── The collection record ───────────────────────────────
const isNew = computed(() => collectionId.value === 'new')
const COLLECTION_LABELS = { name: 'Name' } as const
type CollectionLeaf = keyof typeof COLLECTION_LABELS
/** The collection's own leaf, as opposed to a product open beneath it. */
const openLeaf = computed<CollectionLeaf | null>(() => (frame.childSegment.value === 'name' ? 'name' : null))
const openKey = computed<CollectionLeaf>(() => openLeaf.value ?? 'name')

watchEffect(() => {
  if (isNew.value && (frame.rest.value.length > 1 || (frame.childSegment.value && !openLeaf.value))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

// Keyed to the record so the draft survives the remount between sections.
const form = useState(`collection-draft-${siteId}-${collectionId.value}`, () => ({ name: '' })).value
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
      form.name = ''
      await catalog.refresh()
      toast.add({ description: `${presentation.collectionGroupLabel} created`, color: 'success' })
      await navigateTo(`${productsPath.value}/${created.collection.id}`)
      return
    }
    await dashboardApi(`${endpoint}/${collectionId.value}`, { method: 'PATCH', body: { name: form.name.trim() }, validate: isRecord })
    await catalog.refresh()
    toast.add({ description: 'Name saved', color: 'success' })
    await navigateTo(collectionPath.value)
  } catch (error) {
    // The index column, where the alert lives, is under the detail sheet on narrow screens.
    errorMessage.value = getErrorMessage(error, `Failed to save ${presentation.collectionGroupLabel.toLowerCase()}`)
    toast.add({ description: errorMessage.value, color: 'error' })
  } finally {
    saving.value = false
  }
}

function closeLeaf() {
  if (collection.value) form.name = collection.value.name
  void navigateTo(collectionPath.value)
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted  ">
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-default bg-default px-3  ">
      <div class="flex min-w-0 items-center gap-2">
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" aria-label="Go back" @click="handleBack" />
        <div class="h-6 w-px bg-gray-200 " />
        <span
          class="size-2 shrink-0 rounded-full"
          :class="localHasChanges ? 'bg-warning' : 'bg-success'"
          :aria-label="localHasChanges ? 'Unsaved changes' : siteStatusLabel"
          role="img"
        />
        <p class="truncate text-sm font-semibold text-highlighted ">{{ siteName }}</p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          :href="iframeSrc || undefined"
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Open preview"
          :disabled="!iframeSrc"
        />
        <UButton
          :disabled="!localHasChanges || saving"
          :loading="saving"
          color="primary"
          size="sm"
          @click="handleSaveContent"
        >
          Save
        </UButton>
      </div>
    </header>

    <div v-if="cmsLoadError" class="flex min-h-0 flex-1 items-center justify-center bg-muted p-6">
      <UAlert color="error" variant="soft" title="Content unavailable" :description="cmsLoadError" class="max-w-xl" />
    </div>

    <!-- No locations added yet (only blocks location-scoped pages) -->
    <div
      v-else-if="requiresLocationSelection"
      class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-6"
    >
      <UCard class="w-full max-w-xl">
        <div class="text-center">
          <UIcon name="i-lucide-map-pin" class="mx-auto size-10 text-muted" />
          <h1 class="mt-4 text-xl font-semibold text-highlighted">Add a {{ selectedPageScopeLabel.toLowerCase() }} first</h1>
          <p class="mt-2 text-sm text-muted">
            This page is per-{{ selectedPageScopeLabel.toLowerCase() }}. Add your first {{ selectedPageScopeLabel.toLowerCase() }} to start editing.
          </p>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <UButton
              :to="paths.locations"
              icon="i-lucide-plus"
            >
              Add Location
            </UButton>
            <UButton
              :to="contentPath('home')"
              color="neutral"
              variant="soft"
              icon="i-lucide-file-text"
            >
              Edit Brand Pages Instead
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)_22rem] overflow-hidden">
      <aside class="flex min-h-0 flex-col border-r border-default bg-default  ">
        <div v-if="currentPageIsLocationScoped && siteLocations.length > 1" class="border-b border-default p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Locations</p>
          <div class="space-y-0.5">
            <UButton
              v-for="loc in siteLocations"
              :key="loc.id"
              :label="loc.title"
              size="sm"
              block
              :color="selectedLocationId === loc.id ? 'primary' : 'neutral'"
              :variant="selectedLocationId === loc.id ? 'soft' : 'ghost'"
              class="justify-start"
              @click="selectLocation(loc.id)"
            />
          </div>
        </div>

        <div class="border-b border-default px-4 py-3 ">
          <div class="flex items-center justify-between">
            <h1 class="text-sm font-semibold text-highlighted ">{{ selectedPageLabel }}</h1>
            <UBadge color="neutral" variant="subtle" size="xs">{{ currentPageGroups.length }} sections</UBadge>
          </div>
        </div>

        <UAlert v-if="discardPending" color="error" variant="soft" class="m-3">
          <template #title>Discard unsaved changes?</template>
          <template #actions>
            <UButton @click="handleDiscard" size="xs" color="error">Discard</UButton>
            <UButton @click="discardPending = false" size="xs" color="neutral" variant="ghost">Cancel</UButton>
          </template>
        </UAlert>

        <div class="min-h-0 flex-1 overflow-y-auto py-2">
          <div v-if="contentLoading" class="space-y-2 px-4 py-3">
            <USkeleton class="h-8 w-full rounded" />
            <USkeleton class="h-8 w-full rounded" />
            <USkeleton class="h-8 w-4/5 rounded" />
          </div>
          <div v-else v-for="group in currentPageGroups" :key="group.id" class="border-b border-muted py-1 last:border-b-0 ">
            <UButton
              @click="toggleGroup(group.id)"
              variant="ghost"
              color="neutral"
              size="sm"
              block
              class="justify-between px-4"
            >
              <span class="flex min-w-0 items-center gap-2">
                <UIcon :name="group.icon" class="size-4 shrink-0 text-muted" />
                <span class="truncate text-sm font-medium">{{ group.label }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-4 shrink-0 text-dimmed transition-transform"
                :class="{ 'rotate-180': openGroups.includes(group.id) }"
              />
            </UButton>

            <div v-if="openGroups.includes(group.id)" class="space-y-1 px-2 pb-2">
              <template v-for="fieldKey in group.fields" :key="fieldKey">
                <UButton
                  v-if="getFieldDef(selectedPageId, fieldKey)"
                  block
                  :variant="activeField === fieldKey ? 'soft' : 'ghost'"
                  :color="activeField === fieldKey ? 'primary' : 'neutral'"
                  size="sm"
                  class="justify-start"
                  @click="selectField(fieldKey)"
                >
                    <span class="flex min-w-0 flex-1 items-start gap-2 text-left">
                    <UIcon
                      :name="fieldHasActiveGoogleSync(fieldKey) ? 'i-simple-icons-google' : 'i-lucide-align-left'"
                      class="mt-0.5 size-4 shrink-0"
                      :class="fieldHasActiveGoogleSync(fieldKey) ? 'text-primary' : 'text-dimmed'"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium">{{ getFieldDef(selectedPageId, fieldKey)?.label }}</span>
                      </span>
                      <span class="block truncate text-xs text-muted">{{ fieldPreview(fieldKey) }}</span>
                    </span>
                  </span>
                </UButton>
              </template>
            </div>
          </div>
        </div>

        <div class="space-y-2 border-t border-default p-3 ">
          <UButton
            v-if="localHasChanges"
            block
            color="neutral"
            variant="ghost"
            size="sm"
            @click="handleDiscard"
          >
            Discard changes
          </UButton>
        </div>
      </aside>

      <main class="flex min-w-0 flex-col overflow-hidden bg-elevated">
        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div class="mx-auto h-full max-w-7xl">
            <SitePreviewFrame ref="previewFrameComponent" :iframe-src="iframeSrc" :display-url="displayUrl" />
          </div>
        </div>
      </main>

      <aside class="flex min-h-0 flex-col border-l border-default bg-default  ">
        <div class="flex shrink-0 items-start justify-between border-b border-default px-4 py-3 ">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted ">
              {{ activeFieldDef?.label || 'Content settings' }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ activeFieldDef ? `${selectedPageLabel} / ${selectedLocationLabel} / ${activeFieldDef.label}` : `${selectedPageLabel} / ${selectedLocationLabel}` }}
            </p>
          </div>
          <UButton
            v-if="activeField"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Close editor"
            @click="activeField = null"
          />
        </div>

        <div v-if="activeField" class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div v-if="activeFieldDef?.type === 'text'" class="space-y-2">
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-default">{{ activeFieldDef.label }}</label>
            <UInput
              :id="`field-${activeField}`"
              v-model="editingValue"
              :placeholder="activeFieldDef?.placeholder || activeFieldDef?.defaultValue || 'Enter value...'"
              size="sm"
              class="w-full"
            />
            <p v-if="activeFieldDef?.defaultValue" class="text-xs text-muted">Default: {{ activeFieldDef.defaultValue }}</p>
          </div>

          <div v-else-if="activeFieldDef?.type === 'textarea'" class="space-y-2">
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-default">{{ activeFieldDef.label }}</label>
            <UTextarea
              :id="`field-${activeField}`"
              v-model="editingValue"
              :placeholder="activeFieldDef?.placeholder || activeFieldDef?.defaultValue || 'Enter value...'"
              :rows="5"
              autoresize
              :maxrows="12"
              size="sm"
              class="w-full"
            />
            <p v-if="activeFieldDef?.defaultValue" class="text-xs text-muted">Default: {{ activeFieldDef.defaultValue }}</p>
          </div>

          <div v-else-if="activeFieldDef?.type === 'richtext'" class="space-y-2">
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-default">{{ activeFieldDef.label }}</label>
            <UEditor
              :key="activeField"
              :id="`field-${activeField}`"
              v-model="editingValue"
              content-type="html"
              :placeholder="activeFieldDef?.placeholder || 'Start typing...'"
              class="min-h-40 w-full rounded-md border border-default bg-default px-3 py-2"
            />
          </div>

          <div v-else-if="activeFieldDef?.type === 'media'" class="space-y-2">
            <label class="block text-sm font-medium text-default">{{ activeFieldDef.label }}</label>
            <MediaPicker
              :model-value="(activeField === 'hero.image' || activeField === 'hero.video') ? editingValue || null : pendingMediaAssetId"
              :site-id="props.siteId"
              :accept="activeFieldDef?.mediaKind ?? 'any'"
              :title="activeFieldDef.label"
              @change="onMediaChange"
            />
          </div>

          <div
            v-if="activeFieldDef?.googleLocked && hasGoogleBusinessEntitlement"
            class="flex items-center gap-2 rounded-lg border border-default bg-muted px-3 py-2 text-sm text-default"
          >
            <UBadge color="neutral" variant="soft" size="sm">
              Synced from Google Business
            </UBadge>
          </div>


          <UButton
            v-if="activeFieldRequiresGoogleUpgrade"
            color="neutral"
            variant="soft"
            icon="i-lucide-sparkles"
            block
            class="justify-start text-left"
            @click="openUpgradeModal('google-business-sync')"
          >
            Upgrade to Pro to fill this from Google Business
          </UButton>

                  </div>

        <div v-else class="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <div>
            <UIcon name="i-lucide-mouse-pointer-click" class="mx-auto mb-3 size-8 text-dimmed" />
            <p class="text-sm font-medium text-highlighted ">Select a field</p>
            <p class="mt-1 text-sm text-muted">Choose editable content from the page structure.</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- Toast -->
    <AppToast />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

import { contentRegistry, getEditablePages, getFieldDef, resolvePreviewPath } from '~/config/content-registry'
import type { FieldDefinition } from '~/config/content-registry'
import { resolveCmsCapabilities } from '~/config/cms-registry'
import type { PublicTemplateSlug } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

const props = defineProps<{
  siteId: string
  /** Which half of a template's page inventory to expose here — the host page
   *  decides this by its own route shape (site-scoped vs. location-scoped),
   *  not this component, so a template's page/location split stays declared
   *  in one place (cms-registry.ts) rather than duplicated per host. */
  scope: 'site' | 'location'
  /** Real route param for the selected page (content/[pageId].vue) — page
   *  selection itself lives one level up, in ContentPageIndex.vue. */
  pageId: string
}>()

const dashboardLocation = useDashboardLocation()
const toast = useToast()
const config = useRuntimeConfig()
const { paths, contentPath } = useDashboardSiteLinks(props.siteId)
const { handleBack } = useEditorNavigation(props.siteId)

// ─── Site Context ───────────────────────────────────────────────────────
const siteData = ref<ApiRecord | null>(null)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const siteEntitlements = ref<ApiRecord>({})
const previewToken = ref('')
const cmsLoadError = ref<string | null>(null)
const siteName = computed(() => siteData.value?.brand_name || 'Loading...')
const siteStatusLabel = computed(() => String(siteData.value?.status || 'unknown').replaceAll('_', ' '))
const cmsCapabilities = computed(() => {
  if (!siteData.value) return null
  return resolveCmsCapabilities(siteData.value.vertical as SiteVertical, siteData.value.template as PublicTemplateSlug)
})
const sitePreviewBaseUrl = computed(() => {
  if (!siteData.value?.id) return ''
  const platformBase = (config.public.platformDomain || config.public.freeSiteDomain).replace(/\/$/, '')
  return `${platformBase}/preview/site/${siteData.value.id}`
})

// Load editor context
const loadEditorContext = async () => {
  try {
    const response = await $fetch<{ context: ApiRecord }>(`/api/editor/sites/${props.siteId}/context`)
    siteData.value = response.context.site
    siteLocations.value = response.context.locations || []
    siteEntitlements.value = response.context.site.entitlements || {}
    previewToken.value = response.context.previewToken
  } catch (error) {
    console.error('Failed to load editor context:', error)
    cmsLoadError.value = getErrorMessage(error, 'Failed to load editor context')
    toast.add({ description: cmsLoadError.value, color: 'error' })
    return
  }
  // Outside the try/catch: a bad pageId should surface as a real 404 (thrown
  // via createError), not get caught here and rewritten into a generic toast.
  applyRouteContentScope()
}

// ─── Location Scope ───────────────────────────────────────────────────
const selectedLocationId = ref<string | null>(dashboardLocation.currentLocationId.value)
const effectiveLocationId = computed(() =>
  currentPageIsLocationScoped.value ? selectedLocationId.value : null
)

const selectedLocation = computed(() =>
  siteLocations.value.find(location => location.id === effectiveLocationId.value) || null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title || 'All Locations')

/** Pages that require a specific location to be selected */
const currentPageIsLocationScoped = computed(() =>
  contentRegistry[selectedPageId.value]?.scope === 'location'
)

/** Only block rendering when a location-scoped page has no locations at all */
const requiresLocationSelection = computed(() =>
  currentPageIsLocationScoped.value && siteLocations.value.length === 0
)

const contentQuery = computed(() => {
  const params = new URLSearchParams()
  if (effectiveLocationId.value) params.set('locationId', effectiveLocationId.value)
  return params.toString()
})
const endpointWithContentScope = (path: string) =>
  contentQuery.value ? `${path}?${contentQuery.value}` : path

const selectLocation = async (id: string) => {
  if (localHasChanges.value && import.meta.client && !window.confirm('Discard unsaved changes and switch locations?')) return
  localHasChanges.value = false
  await dashboardLocation.selectLocation(id, { replace: true })
}

// ─── Pages ────────────────────────────────────────────────────────────
const siteVertical = computed<SiteVertical | null>(() => siteData.value ? siteData.value.vertical as SiteVertical : null)
const pages = computed(() => {
  const capabilities = cmsCapabilities.value
  // blawby's cms-registry pages (including home/about/contact) are tagged
  // editor: 'professional_services', not 'site_content' — the backend
  // (assertSiteContentPage in mcp-workflows.ts) rejects them with a 400 for
  // any template other than site_content-editor templates. There is no
  // professional_services page-content editor implementation yet (tracked
  // in issue #323), so this template is excluded here rather than showing
  // a page selector that 400s on every page. Do not remove this without
  // that editor existing first.
  if (!siteVertical.value || !capabilities || capabilities.template === 'blawby') return []
  const allowedPageIds = new Set(capabilities.pages.map(page => page.id))
  return getEditablePages(siteVertical.value, capabilities.template)
    .filter(page => allowedPageIds.has(page.id) && page.scope === props.scope)
})

const selectedPageId = computed(() => props.pageId)
const currentPagePath = computed(() => pages.value.find(p => p.id === selectedPageId.value)?.path || '/')
const selectedPageLabel = computed(() => pages.value.find(p => p.id === selectedPageId.value)?.label || '')
const selectedPageScopeLabel = computed(() => {
  const scope = pages.value.find(p => p.id === selectedPageId.value)?.scopeLabelKey
  return scope === 'site' ? 'Site' : scope === 'office' ? 'Office' : 'Location'
})

const applyRouteContentScope = () => {
  if (!pages.value.some(page => page.id === props.pageId)) {
    throw createError({ statusCode: 404, statusMessage: `Page is not available for this site: ${props.pageId}` })
  }
  // Location scope always comes from the real /locations/[locationSlug] route
  // param (via useDashboardLocation), not a query override — this component
  // never renders a location-scoped page outside that route.
  selectedLocationId.value = dashboardLocation.currentLocationId.value
}
const previewPagePath = computed(() => {
  if (!selectedLocation.value) return currentPagePath.value
  return resolvePreviewPath(selectedPageId.value, { locationSlug: selectedLocation.value.slug })
})

// ─── Iframe ───────────────────────────────────────────────────────────
// SitePreviewFrame owns the actual <iframe>/loading-state; we only need to
// reach into its exposed element for the admin:focus/admin:content-update
// postMessage protocol below.
const previewFrameComponent = ref<{ previewFrame?: HTMLIFrameElement } | null>(null)
const previewReloadToken = ref(0)
const iframeSrc = computed(() => {
  if (!sitePreviewBaseUrl.value) return ''
  if (currentPageIsLocationScoped.value && !selectedLocation.value) return ''
  // sitePreviewBaseUrl includes the /preview/site/[siteId] path segment, so we
  // must append the sub-path directly rather than using new URL(subpath, base)
  // which would replace the path instead of appending to it.
  const subPath = previewPagePath.value === '/' ? '' : previewPagePath.value
  const url = new URL(sitePreviewBaseUrl.value + subPath)
  url.searchParams.set('preview', 'true')
  if (previewToken.value) url.searchParams.set('token', previewToken.value)
  if (currentPageIsLocationScoped.value && selectedLocation.value) url.searchParams.set('location', selectedLocation.value.slug)
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

// The URL a real visitor would actually see — distinct from iframeSrc, which
// points at the internal /preview/site/:id route. Matches the subdomain +
// freeSiteDomain pattern already used for siteDomain in onboarding.vue.
const platformHostname = computed(() => (config.public.freeSiteDomain as string).replace(/^https?:\/\//, ''))
const siteDomain = computed(() => siteData.value?.subdomain ? `${siteData.value.subdomain}.${platformHostname.value}` : '')
const displayUrl = computed(() => {
  if (!siteDomain.value) return ''
  const subPath = previewPagePath.value === '/' ? '' : previewPagePath.value
  return siteDomain.value + subPath
})

const previewOrigin = computed(() => {
  if (!iframeSrc.value) return null
  try {
    return new URL(iframeSrc.value).origin
  } catch {
    return null
  }
})

// Page switching is real route navigation (content/[pageId]) now, guarded
// generically by the onBeforeRouteLeave() unsaved-changes confirm below —
// this just reloads content when the pageId route param actually changes.
watch(() => props.pageId, async (newVal, oldVal) => {
  if (newVal === oldVal) return
  activeField.value = null
  openGroups.value = ['hero']
  localHasChanges.value = false
  if (currentPageIsLocationScoped.value && !selectedLocationId.value && siteLocations.value.length > 0) {
    const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]!
    await dashboardLocation.selectLocation(primary.id, { replace: true })
    selectedLocationId.value = primary.id
  }
  await loadPageContent()
})

watch(() => dashboardLocation.currentLocationId.value, async (newVal, oldVal) => {
  selectedLocationId.value = newVal
  if (newVal !== oldVal) {
    activeField.value = null
    const previousValues = { ...currentValues.value }

    if (requiresLocationSelection.value) return
    try {
      await loadPageContent()
    } catch (_) {
      if (oldVal) await dashboardLocation.selectLocation(oldVal, { replace: true })
      currentValues.value = previousValues
    }
  }
})

// ─── Groups ───────────────────────────────────────────────────────────
const openGroups = ref<string[]>(['hero'])

const currentPageGroups = computed(() => contentRegistry[selectedPageId.value]?.groups ?? [])

const toggleGroup = (id: string) => {
  const idx = openGroups.value.indexOf(id)
  if (idx === -1) openGroups.value.push(id)
  else openGroups.value.splice(idx, 1)
}

// ─── Active field ─────────────────────────────────────────────────────
const activeField = ref<string | null>(null)
const editingValue = ref('')

const activeFieldDef = computed<FieldDefinition | undefined>(() =>
  activeField.value ? getFieldDef(selectedPageId.value, activeField.value) : undefined
)

const hasGoogleBusinessEntitlement = computed(() => siteEntitlements.value.google_business === true)
const activeFieldRequiresGoogleUpgrade = computed(() =>
  activeFieldDef.value?.googleLocked === true && !hasGoogleBusinessEntitlement.value
)
// Upgrade modal is feature-flagged off (see composables/useUpgradeModal.ts) —
// open() is currently a no-op, so the "Upgrade to Pro..." button below is a
// harmless dead click until that flag is re-enabled.
const { open: openUpgradeModal } = useUpgradeModal()

const fieldSupportsGoogle = (fieldKey: string): boolean =>
  getFieldDef(selectedPageId.value, fieldKey)?.sources?.includes('google') === true
const fieldHasActiveGoogleSync = (fieldKey: string): boolean =>
  hasGoogleBusinessEntitlement.value && fieldSupportsGoogle(fieldKey)

const selectField = (key: string) => {
  if (contentLoading.value) return
  activeField.value = key
  editingValue.value = currentValues.value[key] || ''
  pendingMediaAssetId.value = null

  // Find which group this field belongs to
  const group = currentPageGroups.value.find(g => g.fields.includes(key))
  const previewFrameEl = previewFrameComponent.value?.previewFrame
  if (group && previewFrameEl?.contentWindow && previewOrigin.value) {
    previewFrameEl.contentWindow.postMessage({
      type: 'admin:focus',
      field: key,
      group: group.id
    }, previewOrigin.value)
  }
}

const postPreviewUpdate = () => {
  const previewFrameEl = previewFrameComponent.value?.previewFrame
  if (!activeField.value || !previewFrameEl?.contentWindow || !previewOrigin.value) return

  previewFrameEl.contentWindow.postMessage({
    type: 'admin:content-update',
    page: selectedPageId.value,
    field: activeField.value,
    value: editingValue.value
  }, previewOrigin.value)
}

watch(editingValue, () => {
  if (activeField.value && !contentLoading.value && currentValues.value[activeField.value] !== editingValue.value) {
    currentValues.value = { ...currentValues.value, [activeField.value]: editingValue.value }
    localHasChanges.value = true
  }
  postPreviewUpdate()
})


// Tracks the picked asset ID separately so MediaPicker can show the thumbnail
// within the current editor session. On reload, non-hero media editingValue is
// a public URL (not an ID), so the picker falls back to showing "Select media".
const pendingMediaAssetId = ref<string | null>(null)

function onMediaChange(asset: { id: string; publicUrl: string } | null) {
  const isHeroMedia = activeField.value === 'hero.image' || activeField.value === 'hero.video'
  // Hero media: backend stores asset ID in a dedicated column and resolves URL via JOIN.
  // Other media fields: store the public URL in the content column so it's directly
  // usable as an <img src> on public pages without an additional API round-trip.
  editingValue.value = isHeroMedia ? (asset?.id ?? '') : (asset?.publicUrl ?? '')
  pendingMediaAssetId.value = asset?.id ?? null
}



// ─── Content state ────────────────────────────────────────────────────
const currentValues = ref<Record<string, string>>({})
const localHasChanges = ref(false)
const saving = ref(false)
const discardPending = ref(false)
const contentLoading = ref(false)
const loadVersion = ref(0)

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = (error as Record<string, unknown>).response
    if (response && typeof response === 'object') {
      const responseData = (response as Record<string, unknown>)._data
      if (responseData && typeof responseData === 'object') {
        const apiError = (responseData as Record<string, unknown>).error
        if (typeof apiError === 'string' && apiError) return apiError
        const statusMessage = (responseData as Record<string, unknown>).statusMessage
        if (typeof statusMessage === 'string' && statusMessage) return statusMessage
      }
    }

    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }

  return fallback
}

const loadPageContent = async () => {
  const version = ++loadVersion.value
  if (requiresLocationSelection.value) return
  contentLoading.value = true
  try {
    const res = await $fetch<{ fields: ApiRecord[] }>(
      endpointWithContentScope(`/api/editor/sites/${props.siteId}/content/${selectedPageId.value}`)
    )
    if (version !== loadVersion.value) return
    const map: Record<string, string> = {}
    for (const row of res.fields) {
      if (row.field === 'hero') {
        // Hero fields use dedicated columns, support both asset_id and url for migration
        if (row.hero_title) map['hero.title'] = row.hero_title
        if (row.hero_subtitle) map['hero.subtitle'] = row.hero_subtitle
        if (row.hero_image_asset_id) map['hero.image'] = row.hero_image_asset_id
        else if (row.hero_public_url) map['hero.image'] = row.hero_public_url
        if (row.hero_video_asset_id) map['hero.video'] = row.hero_video_asset_id
        else if (row.hero_video_public_url) map['hero.video'] = row.hero_video_public_url
      } else {
        map[row.field] = row.content || ''
      }
    }
    currentValues.value = map
  } catch (error) {
    if (version !== loadVersion.value) return
    console.error('Failed to load page content:', error)
    toast.add({ description: 'Failed to load content', color: 'error' })
    throw error
  } finally {
    if (version === loadVersion.value) contentLoading.value = false
  }
}

// Load on mount
onMounted(async () => {
  await loadEditorContext()
  await loadPageContent()
})

// ─── Actions ──────────────────────────────────────────────────────────
const handleSaveContent = async () => {
  if (!localHasChanges.value) return
  for (const [field, value] of Object.entries(currentValues.value)) {
    const fieldDefinition = getFieldDef(selectedPageId.value, field)
    if (!fieldDefinition?.validate) continue
    const validationResult = fieldDefinition.validate(value)
    if (validationResult !== true) {
      toast.add({ description: typeof validationResult === 'string' ? validationResult : `Invalid value for ${fieldDefinition.label}`, color: 'error' })
      return
    }
  }
  saving.value = true
  try {
    await $fetch(`/api/editor/sites/${props.siteId}/content/save`, {
      method: 'POST',
      body: { page: selectedPageId.value, changes: currentValues.value },
      query: effectiveLocationId.value ? { locationId: effectiveLocationId.value } : {},
      credentials: 'include'
    })
    localHasChanges.value = false
    previewReloadToken.value = Date.now()
  } catch (error) {
    const msg = getErrorMessage(error, 'Unknown error')
    toast.add({ description: `Save failed: ${msg}`, color: 'error' })
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    saving.value = false
  }
}

const handleDiscard = async () => {
  if (!discardPending.value) {
    discardPending.value = true
    return
  }
  discardPending.value = false
  try {
    localHasChanges.value = false
    await loadPageContent()
    toast.add({ description: 'Unsaved changes discarded', color: 'info' })
    previewReloadToken.value = Date.now()
  } catch {
    toast.add({ description: 'Failed to discard', color: 'error' })
  }
}

onBeforeRouteLeave(() => {
  if (!localHasChanges.value || !import.meta.client) return true
  return window.confirm('Discard unsaved content changes?')
})

// ─── Utilities ────────────────────────────────────────────────────────
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

const fieldPreview = (fieldKey: string): string => {
  const fieldDef = getFieldDef(selectedPageId.value, fieldKey)
  const raw = currentValues.value[fieldKey] || fieldDef?.defaultValue
  if (!raw) return fieldHasActiveGoogleSync(fieldKey) ? 'Synced from Google Business' : 'Add content'
  const text = stripHtml(raw)
  return text.length > 48 ? text.substring(0, 45) + '…' : text || 'Add content'
}
</script>

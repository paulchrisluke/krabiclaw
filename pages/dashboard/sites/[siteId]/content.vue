<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted  ">
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-default bg-default px-3  ">
      <div class="flex min-w-0 items-center gap-2">
        <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" size="sm" aria-label="Go back" @click="handleBack" />
        <div class="h-6 w-px bg-gray-200 " />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-semibold text-highlighted ">{{ siteName }}</p>
            <UBadge :color="serverHasDrafts || localHasChanges ? 'warning' : 'success'" variant="soft" size="xs">
              {{ serverHasDrafts || localHasChanges ? 'Draft' : 'Live' }}
            </UBadge>
          </div>
          <p class="truncate text-xs text-muted">{{ siteDomain }}</p>
        </div>
      </div>

      <!-- Location tabs — only shown for location-scoped pages (Location, Menu) -->
      <div v-if="currentPageIsLocationScoped" class="hidden min-w-0 items-center gap-1 md:flex">
        <UButton
          v-for="loc in siteLocations"
          :key="loc.id"
          :label="loc.title"
          size="sm"
          :color="selectedLocationId === loc.id ? 'primary' : 'neutral'"
          :variant="selectedLocationId === loc.id ? 'soft' : 'ghost'"
          @click="selectLocation(loc.id)"
        />
      </div>

      <!-- Page selector always visible -->
      <div class="hidden min-w-0 items-center gap-2 md:flex">
        <USelect
          id="content-page-selector"
          v-model="selectedPageId"
          :items="pages"
          value-key="id"
          label-key="label"
          class="w-44"
          @update:model-value="onPageChange"
        />
      </div>

      <div class="flex items-center gap-2">
        <UColorModeButton variant="ghost" color="neutral" size="sm" />
        <UButton
          :href="iframeSrc || undefined"
          target="_blank"
          icon="i-heroicons-arrow-top-right-on-square"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Open preview"
          :disabled="!iframeSrc"
        />
        <UButton
          :disabled="!localHasChanges || saving"
          :loading="saving"
          color="neutral"
          variant="outline"
          size="sm"
          @click="handleSaveDraft"
        >
          Save draft
        </UButton>
        <UButton
          id="content-publish-btn"
          :disabled="publishing || (!localHasChanges && !serverHasDrafts)"
          :loading="publishing"
          color="primary"
          size="sm"
          @click="handlePublish"
        >
          Publish
        </UButton>
      </div>
    </header>

    <!-- No locations added yet (only blocks location-scoped pages) -->
    <div
      v-if="requiresLocationSelection"
      class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-6"
    >
      <UCard class="w-full max-w-xl">
        <div class="text-center">
          <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-muted" />
          <h1 class="mt-4 text-xl font-semibold text-highlighted">Add a location first</h1>
          <p class="mt-2 text-sm text-muted">
            The Location and Menu pages are per-location. Add your first location to start editing.
          </p>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <UButton
              :to="`/dashboard/sites/${siteId}/locations`"
              icon="i-heroicons-plus"
            >
              Add Location
            </UButton>
            <UButton
              :to="`/dashboard/sites/${siteId}/content?page=home`"
              color="neutral"
              variant="soft"
              icon="i-heroicons-document-text"
            >
              Edit Brand Pages Instead
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)_22rem] overflow-hidden">
      <aside class="flex min-h-0 flex-col border-r border-default bg-default  ">
        <!-- Mobile: location tabs + page selector -->
        <div class="border-b border-default p-3 md:hidden">
          <div class="space-y-2">
            <div v-if="currentPageIsLocationScoped" class="flex flex-wrap gap-1">
              <UButton
                v-for="loc in siteLocations"
                :key="loc.id"
                :label="loc.title"
                size="xs"
                :color="selectedLocationId === loc.id ? 'primary' : 'neutral'"
                :variant="selectedLocationId === loc.id ? 'soft' : 'ghost'"
                @click="selectLocation(loc.id)"
              />
            </div>
            <USelect
              v-model="selectedPageId"
              :items="pages"
              value-key="id"
              label-key="label"
              @update:model-value="onPageChange"
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
          <template #title>Discard all draft changes?</template>
          <template #actions>
            <UButton @click="handleDiscard" size="xs" color="error">Discard</UButton>
            <UButton @click="discardPending = false" size="xs" color="neutral" variant="ghost">Cancel</UButton>
          </template>
        </UAlert>

        <div class="min-h-0 flex-1 overflow-y-auto py-2">
          <div v-for="group in currentPageGroups" :key="group.id" class="border-b border-muted py-1 last:border-b-0 ">
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
                name="i-heroicons-chevron-down-20-solid"
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
                      :name="fieldHasActiveGoogleSync(fieldKey) ? 'i-simple-icons-google' : 'i-heroicons-bars-3-bottom-left'"
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
            v-if="localHasChanges || serverHasDrafts"
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
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-default bg-default px-4  ">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-heroicons-globe-alt" class="size-4 text-muted" />
            <p class="truncate text-sm text-muted">{{ siteDomain }}{{ currentPagePath }}</p>
          </div>
          <UBadge color="neutral" variant="subtle" size="xs">Preview</UBadge>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div class="relative mx-auto h-full min-h-160 max-w-7xl overflow-hidden rounded-lg border border-default bg-default shadow-sm  ">
        <iframe
          id="site-preview-frame"
          ref="previewFrame"
          :src="iframeSrc"
          class="w-full h-full border-0 transition-opacity duration-300"
          :class="{ 'opacity-40': iframeLoading }"
          @load="iframeLoading = false"
        />
        <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
          <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="flex items-center gap-3 rounded-lg border border-default bg-default px-4 py-3 shadow-sm  ">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin text-muted" />
              <p class="text-sm text-muted">Loading preview...</p>
            </div>
          </div>
        </Transition>
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
            icon="i-heroicons-x-mark-20-solid"
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
            <div class="flex flex-wrap gap-1 rounded-md border border-default bg-muted p-1">
              <UButton
                v-for="cmd in richtextCommands"
                :key="cmd.cmd"
                size="xs"
                variant="ghost"
                @mousedown.prevent="execCmd(cmd.cmd)"
              >
                {{ cmd.label }}
              </UButton>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <div
              :id="`field-${activeField}`"
              contenteditable="true"
              class="prose prose-sm min-h-40 w-full max-w-none rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              :data-placeholder="activeFieldDef?.placeholder || 'Start typing...'"
              v-html="DOMPurify.sanitize(editingValue || '')"
              @blur="onRichTextBlur"
            />
            <!-- eslint-enable vue/no-v-html -->
          </div>

          <div v-else-if="activeFieldDef?.type === 'media'" class="space-y-2">
            <label class="block text-sm font-medium text-default">{{ activeFieldDef.label }}</label>
            <MediaPicker
              :model-value="editingValue || null"
              :site-id="siteId"
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
            id="field-apply-btn"
            :disabled="saving"
            :loading="saving"
            color="primary"
            block
            @click="applyField"
          >
            Apply
          </UButton>

          <UButton
            v-if="activeFieldRequiresGoogleUpgrade"
            color="neutral"
            variant="soft"
            icon="i-heroicons-sparkles"
            block
            class="justify-start text-left"
            @click="openUpgradeModal('google-business-sync')"
          >
            Upgrade to Pro to fill this from Google Business
          </UButton>

                  </div>

        <div v-else class="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <div>
            <UIcon name="i-heroicons-cursor-arrow-rays" class="mx-auto mb-3 size-8 text-dimmed" />
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
import DOMPurify from 'isomorphic-dompurify'
import { editablePages, getFieldDef } from '~/config/content-registry'
import type { FieldDefinition } from '~/config/content-registry'

definePageMeta({ layout: 'editor', ssr: false })

const route = useRoute()
const router = useRouter()
const siteId = route.params.siteId as string
const toast = useToast()
const config = useRuntimeConfig()

const handleBack = () => {
  router.back()
}

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  return domain.replace(/^https?:\/\//, '')
})

// ─── Site Context ───────────────────────────────────────────────────────
const siteData = ref<ApiRecord | null>(null)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const organizationEntitlements = ref<ApiRecord>({})
const previewToken = ref('')
const siteName = computed(() => siteData.value?.brand_name || 'Loading...')
const siteDomain = computed(() => siteData.value?.subdomain ? `${siteData.value.subdomain}.${platformHostname.value}` : 'localhost:3000')
const sitePreviewBaseUrl = computed(() => {
  if (!siteData.value?.subdomain) return ''

  const base = new URL(config.public.freeSiteDomain)
  const hostname = base.hostname === 'localhost'
    ? `${siteData.value.subdomain}.localhost`
    : `${siteData.value.subdomain}.${base.hostname}`

  return `${base.protocol}//${hostname}${base.port ? `:${base.port}` : ''}`
})

// Load editor context
const loadEditorContext = async () => {
  try {
    const response = await $fetch<{ context: ApiValue }>(`/api/editor/sites/${siteId}/context`)
    siteData.value = response.context.site
    siteLocations.value = response.context.locations || []
    organizationEntitlements.value = response.context.organization.entitlements || {}
    previewToken.value = response.context.previewToken
    applyRouteContentScope()
  } catch (error) {
    console.error('Failed to load editor context:', error)
    toast.add({ description: 'Failed to load editor context', color: 'error' })
  }
}

// ─── Location Scope ───────────────────────────────────────────────────
import { contentRegistry } from '~/config/content-registry'

const selectedLocationId = ref<string | null>(null)

const selectedLocation = computed(() =>
  siteLocations.value.find(location => location.id === selectedLocationId.value) || null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title || 'All Locations')

/** Pages that require a specific location to be selected */
const currentPageIsLocationScoped = computed(() =>
  contentRegistry[selectedPageId.value]?.locationScoped === true
)

/** Only block rendering when a location-scoped page has no locations at all */
const requiresLocationSelection = computed(() =>
  currentPageIsLocationScoped.value && siteLocations.value.length === 0
)

const contentQuery = computed(() => {
  const params = new URLSearchParams()
  if (selectedLocationId.value) params.set('locationId', selectedLocationId.value)
  return params.toString()
})
const endpointWithContentScope = (path: string) =>
  contentQuery.value ? `${path}?${contentQuery.value}` : path

const selectLocation = (id: string) => {
  selectedLocationId.value = id
  activeField.value = null
}

const onLocationChange = () => {
  iframeLoading.value = true
  activeField.value = null
  if (requiresLocationSelection.value) return
  loadPageContent()
}

// ─── Pages ────────────────────────────────────────────────────────────
const pages = editablePages.map(p => ({
  id: p.path === '/' ? 'home' : p.path.replace(/^\//, '').replace(/\//g, '-'),
  label: p.label,
  path: p.path
}))

const selectedPageId = ref('home')
const currentPagePath = computed(() => pages.find(p => p.id === selectedPageId.value)?.path || '/')
const selectedPageLabel = computed(() => pages.find(p => p.id === selectedPageId.value)?.label || '')

const applyRouteContentScope = () => {
  const queryPage = route.query.page
  if (typeof queryPage === 'string' && pages.some(page => page.id === queryPage)) {
    selectedPageId.value = queryPage
  }

  const queryLocationId = route.query.locationId
  if (typeof queryLocationId === 'string' && siteLocations.value.some(location => location.id === queryLocationId)) {
    selectedLocationId.value = queryLocationId
  }
}
const previewPagePath = computed(() => {
  if (!selectedLocation.value) return currentPagePath.value
  if (selectedPageId.value === 'location') return `/locations/${selectedLocation.value.slug}`
  if (selectedPageId.value === 'menu') return `/locations/${selectedLocation.value.slug}/menu`
  return currentPagePath.value
})

// ─── Iframe ───────────────────────────────────────────────────────────
const previewFrame = ref<HTMLIFrameElement>()
const iframeLoading = ref(true)
const previewReloadToken = ref(0)
const iframeSrc = computed(() => {
  if (!sitePreviewBaseUrl.value) return ''
  const url = new URL(previewPagePath.value, sitePreviewBaseUrl.value)
  url.searchParams.set('preview', 'true')
  if (previewToken.value) url.searchParams.set('token', previewToken.value)
  if (selectedLocation.value) url.searchParams.set('location', selectedLocation.value.slug)
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const onPageChange = () => {
  activeField.value = null
  // When switching to a location-scoped page, auto-select the primary/first location
  if (currentPageIsLocationScoped.value && !selectedLocationId.value && siteLocations.value.length > 0) {
    const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]!
    selectedLocationId.value = primary.id
  }
  // When switching away from a location-scoped page, clear the location selection
  if (!currentPageIsLocationScoped.value) {
    selectedLocationId.value = null
  }
}

watch(selectedPageId, () => {
  onPageChange()
})

watch(selectedLocationId, () => {
  onLocationChange()
})

// ─── Groups ───────────────────────────────────────────────────────────
const openGroups = ref<string[]>(['hero'])

const groupConfig: Record<string, Array<{ id: string; label: string; icon: string; fields: string[] }>> = {
  home: [
    { id: 'hero',   label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image', 'hero.video'] },
    { id: 'cta',    label: 'Call to Action',  icon: 'i-heroicons-megaphone', fields: ['cta.title', 'cta.description'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.description', 'business.establishment_year'] },
    { id: 'contact', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] },
    { id: 'media', label: 'Gallery & Media', icon: 'i-heroicons-photo', fields: ['business.photos'] }
  ],
  about: [
    { id: 'hero',    label: 'Hero Section', icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image'] },
    { id: 'story',   label: 'Story',        icon: 'i-heroicons-book-open', fields: ['story.intro', 'journey.title', 'journey.body', 'experience.body'] },
    { id: 'cuisine', label: 'Cuisine',      icon: 'i-heroicons-sparkles', fields: ['grill.title', 'grill.description', 'sushi.title', 'sushi.description'] },
    { id: 'business',  label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.description', 'business.establishment_year'] }
  ],
  contact: [
    { id: 'hero',    label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image'] },
    { id: 'content', label: 'Page Content',    icon: 'i-heroicons-document-text', fields: ['intro.body'] },
    { id: 'social',  label: 'Social Links',    icon: 'i-heroicons-link', fields: ['social.facebook', 'social.instagram', 'social.tiktok'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.establishment_year'] },
    { id: 'contact-hours', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] }
  ],
  location: [
    { id: 'hero',    label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image'] },
    { id: 'content', label: 'Additional Info', icon: 'i-heroicons-document-text', fields: ['parking.info', 'extra.notes'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.establishment_year'] },
    { id: 'contact-hours', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] }
  ],
  menu: [
    { id: 'hero',    label: 'Hero Section',      icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image'] },
    { id: 'content', label: 'Menu Introduction', icon: 'i-heroicons-document-text', fields: ['description'] },
    { id: 'media',  label: 'Gallery & Media',   icon: 'i-heroicons-photo', fields: ['business.products'] }
  ],
  reservations: [
    { id: 'hero',     label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.image'] },
    { id: 'contact',  label: 'Contact Details', icon: 'i-heroicons-phone', fields: ['contact.phone', 'contact.email'] },
    { id: 'policies', label: 'Policies',        icon: 'i-heroicons-clipboard-document-list', fields: ['policies.body'] }
  ]
}

const currentPageGroups = computed(() => groupConfig[selectedPageId.value] || [])

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

const hasGoogleBusinessEntitlement = computed(() => organizationEntitlements.value.google_business === true)
const activeFieldRequiresGoogleUpgrade = computed(() =>
  activeFieldDef.value?.googleLocked === true && !hasGoogleBusinessEntitlement.value
)
const { open: openUpgradeModal } = useUpgradeModal()

const fieldSupportsGoogle = (fieldKey: string): boolean =>
  getFieldDef(selectedPageId.value, fieldKey)?.sources.includes('google') === true
const fieldHasActiveGoogleSync = (fieldKey: string): boolean =>
  hasGoogleBusinessEntitlement.value && fieldSupportsGoogle(fieldKey)

const selectField = (key: string) => {
  activeField.value = key
  editingValue.value = currentValues.value[key] || ''
  
  // Find which group this field belongs to
  const group = currentPageGroups.value.find(g => g.fields.includes(key))
  if (group && previewFrame.value?.contentWindow) {
    previewFrame.value.contentWindow.postMessage({
      type: 'admin:focus',
      field: key,
      group: group.id
    }, '*')
  }
}

const postPreviewUpdate = () => {
  if (!activeField.value || !previewFrame.value?.contentWindow) return

  previewFrame.value.contentWindow.postMessage({
    type: 'admin:content-update',
    page: selectedPageId.value,
    field: activeField.value,
    value: editingValue.value
  }, '*')
}

watch(editingValue, () => {
  postPreviewUpdate()
})

const onRichTextBlur = (e: FocusEvent) => {
  editingValue.value = DOMPurify.sanitize((e.target as HTMLElement).innerHTML)
}

function onMediaChange(asset: { id: string; publicUrl: string } | null) {
  editingValue.value = asset?.id ?? ''
}

const richtextCommands = [
  { cmd: 'bold',                label: 'B' },
  { cmd: 'italic',              label: 'I' },
  { cmd: 'insertUnorderedList', label: '• List' },
  { cmd: 'insertOrderedList',   label: '1. List' }
]
const execCmd = (cmd: string) => document.execCommand(cmd, false)

const applyField = async () => {
  if (!activeField.value || !activeFieldDef.value) return
  
  // Validation check
  if (activeFieldDef.value.validate) {
    const validationResult = activeFieldDef.value.validate(editingValue.value)
    if (validationResult !== true) {
      toast.add({ 
        title: 'Validation Error',
        description: typeof validationResult === 'string' ? validationResult : 'Invalid value', 
        color: 'error' 
      })
      return
    }
  }

  // Handle regular content fields
  currentValues.value = { ...currentValues.value, [activeField.value]: editingValue.value }
  localHasChanges.value = true
  
  // Automatically save and refresh preview for immediate feedback
  await handleSaveDraft()
  toast.add({ description: `"${activeFieldDef.value.label}" updated`, color: 'success' })
}

// ─── Content state ────────────────────────────────────────────────────
const currentValues = ref<Record<string, string>>({})
const localHasChanges = ref(false)
const serverHasDrafts = ref(false)
const saving = ref(false)
const publishing = ref(false)
const discardPending = ref(false)

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = (error as Record<string, unknown>).response
    if (response && typeof response === 'object') {
      const responseData = (response as Record<string, unknown>)._data
      if (responseData && typeof responseData === 'object') {
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
  if (requiresLocationSelection.value) return

  try {
    const res = await $fetch<{ content: ApiRecord[]; hasDrafts: boolean }>(
      endpointWithContentScope(`/api/editor/sites/${siteId}/content/${selectedPageId.value}`)
    )
    const map: Record<string, string> = {}
    for (const row of res.content || []) {
      if (row.field === 'hero') {
        // Hero fields use dedicated columns, support both asset_id and url for migration
        if (row.hero_title) map['hero.title'] = row.hero_title
        if (row.hero_subtitle) map['hero.subtitle'] = row.hero_subtitle
        if (row.hero_image_asset_id) map['hero.image'] = row.hero_image_asset_id
        else if (row.hero_image_url) map['hero.image'] = row.hero_image_url
        if (row.hero_video_asset_id) map['hero.video'] = row.hero_video_asset_id
        else if (row.hero_video_url) map['hero.video'] = row.hero_video_url
      } else {
        map[row.field] = row.content || ''
      }
    }
    currentValues.value = map
    serverHasDrafts.value = res.hasDrafts ?? false
  } catch (error) {
    console.error('Failed to load page content:', error)
    toast.add({ description: 'Failed to load content', color: 'error' })
  }
}

// Load on mount
onMounted(async () => {
  await loadEditorContext()
  await loadPageContent()
})

// ─── Actions ──────────────────────────────────────────────────────────
const handleSaveDraft = async () => {
  if (!localHasChanges.value) return
  saving.value = true
  try {
    await $fetch(`/api/editor/sites/${siteId}/content/draft`, {
      method: 'POST',
      body: { page: selectedPageId.value, changes: currentValues.value },
      query: selectedLocationId.value ? { locationId: selectedLocationId.value } : {},
      credentials: 'include'
    })
    localHasChanges.value = false
    serverHasDrafts.value = true
    iframeLoading.value = true
    previewReloadToken.value = Date.now()
  } catch (error) {
    const msg = getErrorMessage(error, 'Unknown error')
    toast.add({ description: `Save failed: ${msg}`, color: 'error' })
    throw error instanceof Error ? error : new Error(String(error)) // Re-throw so callers like handlePublish know it failed
  } finally {
    saving.value = false
  }
}

const handlePublish = async () => {
  publishing.value = true
  try {
    if (localHasChanges.value) await handleSaveDraft()
    await $fetch(`/api/editor/sites/${siteId}/content/publish`, {
      method: 'POST',
      body: { page: selectedPageId.value, locationId: selectedLocationId.value }
    })
    serverHasDrafts.value = false
    localHasChanges.value = false
    toast.add({ description: 'Published live!', color: 'success' })
    iframeLoading.value = true
    previewReloadToken.value = Date.now()
  } catch (error) {
    const msg = getErrorMessage(error, 'Unknown error')
    toast.add({ description: `Publish failed: ${msg}`, color: 'error' })
  } finally {
    publishing.value = false
  }
}

const handleDiscard = async () => {
  if (!discardPending.value) {
    discardPending.value = true
    return
  }
  discardPending.value = false
  try {
    await $fetch(`/api/editor/sites/${siteId}/content/discard`, {
      method: 'POST',
      body: { page: selectedPageId.value },
      query: selectedLocationId.value ? { locationId: selectedLocationId.value } : {}
    })
    localHasChanges.value = false
    serverHasDrafts.value = false
    await loadPageContent()
    toast.add({ description: 'Drafts discarded', color: 'info' })
    iframeLoading.value = true
    previewReloadToken.value = Date.now()
  } catch {
    toast.add({ description: 'Failed to discard', color: 'error' })
  }
}

// ─── Utilities ────────────────────────────────────────────────────────
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

const fieldPreview = (fieldKey: string): string => {
  const raw = currentValues.value[fieldKey] || getFieldDef(selectedPageId.value, fieldKey)?.defaultValue
  if (!raw) return fieldHasActiveGoogleSync(fieldKey) ? 'Synced from Google Business' : 'Add content'
  const text = stripHtml(raw)
  return text.length > 48 ? text.substring(0, 45) + '…' : text || 'Add content'
}

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<style scoped>
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: #a8a29e;
  font-style: italic;
  pointer-events: none;
}
</style>

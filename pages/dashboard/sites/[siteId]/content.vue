<template>
  <div class="flex h-screen flex-col overflow-hidden bg-(--ui-bg-muted) text-(--ui-text-highlighted)  ">
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-(--ui-border) bg-(--ui-bg) px-3  ">
      <div class="flex min-w-0 items-center gap-2">
        <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" size="sm" aria-label="Go back" @click="handleBack" />
        <div class="h-6 w-px bg-gray-200 " />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-semibold text-(--ui-text-highlighted) ">{{ siteName }}</p>
            <UBadge :color="serverHasDrafts || localHasChanges ? 'warning' : 'success'" variant="soft" size="xs">
              {{ serverHasDrafts || localHasChanges ? 'Draft' : 'Live' }}
            </UBadge>
          </div>
          <p class="truncate text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">{{ siteDomain }}</p>
        </div>
      </div>

      <div class="hidden min-w-0 items-center gap-2 md:flex">
        <USelect
          id="content-location-selector"
          v-model="selectedLocationId"
          :items="locationOptions"
          value-key="id"
          label-key="label"
          class="w-52"
          icon="i-heroicons-map-pin"
          @update:model-value="onLocationChange"
        />
        <USelect
          id="content-page-selector"
          v-model="selectedPageId"
          :items="pages"
          value-key="id"
          label-key="label"
          class="w-44"
          @update:model-value="onPageChange"
        />
        <UBadge color="neutral" variant="subtle" size="sm">{{ selectedPageLabel }}</UBadge>
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

    <div
      v-if="requiresLocationSelection"
      class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-(--ui-bg-muted) p-6"
    >
      <UCard class="w-full max-w-xl">
        <div class="text-center">
          <UIcon name="i-heroicons-map-pin" class="mx-auto size-10 text-(--ui-text-muted)" />
          <h1 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">Choose a location first</h1>
          <p class="mt-2 text-sm text-(--ui-text-muted)">
            Location and menu pages are edited per physical location, so add or select a location before editing this page.
          </p>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <UButton
              v-if="siteLocations.length === 0"
              :to="`/dashboard/sites/${siteId}/settings?tab=locations`"
              icon="i-heroicons-plus"
            >
              Add Location
            </UButton>
            <UButton
              v-else
              :to="`/dashboard/sites/${siteId}/locations`"
              icon="i-heroicons-map-pin"
            >
              Choose Location
            </UButton>
            <UButton
              :to="`/dashboard/sites/${siteId}/content?page=home`"
              color="neutral"
              variant="soft"
              icon="i-heroicons-document-text"
            >
              Edit Brand Pages
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)_22rem] overflow-hidden">
      <aside class="flex min-h-0 flex-col border-r border-(--ui-border) bg-(--ui-bg)  ">
        <div class="border-b border-(--ui-border) p-3  md:hidden">
          <div class="space-y-2">
            <USelect
              v-model="selectedLocationId"
              :items="locationOptions"
              value-key="id"
              label-key="label"
              icon="i-heroicons-map-pin"
              @update:model-value="onLocationChange"
            />
            <USelect
              v-model="selectedPageId"
              :items="pages"
              value-key="id"
              label-key="label"
              @update:model-value="onPageChange"
            />
          </div>
        </div>

        <div class="border-b border-(--ui-border) px-4 py-3 ">
          <div class="flex items-center justify-between">
            <h1 class="text-sm font-semibold text-(--ui-text-highlighted) ">{{ selectedPageLabel }}</h1>
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
          <div v-for="group in currentPageGroups" :key="group.id" class="border-b border-(--ui-border-muted) py-1 last:border-b-0 ">
            <UButton
              @click="toggleGroup(group.id)"
              variant="ghost"
              color="neutral"
              size="sm"
              block
              class="justify-between px-4"
            >
              <span class="flex min-w-0 items-center gap-2">
                <UIcon :name="group.icon" class="size-4 shrink-0 text-(--ui-text-muted)" />
                <span class="truncate text-sm font-medium">{{ group.label }}</span>
              </span>
              <UIcon
                name="i-heroicons-chevron-down-20-solid"
                class="size-4 shrink-0 text-(--ui-text-dimmed) transition-transform"
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
                      :name="fieldSupportsGoogle(fieldKey) ? 'i-heroicons-lock-closed' : 'i-heroicons-bars-3-bottom-left'"
                      class="mt-0.5 size-4 shrink-0 text-(--ui-text-dimmed)"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium">{{ getFieldDef(selectedPageId, fieldKey)?.label }}</span>
                      </span>
                      <span class="block truncate text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">{{ fieldPreview(fieldKey) }}</span>
                    </span>
                  </span>
                </UButton>
              </template>
            </div>
          </div>
        </div>

        <div class="space-y-2 border-t border-(--ui-border) p-3 ">
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

      <main class="flex min-w-0 flex-col overflow-hidden bg-(--ui-bg-elevated) dark:bg-gray-950">
        <div class="flex h-11 shrink-0 items-center justify-between border-b border-(--ui-border) bg-(--ui-bg) px-4  ">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-heroicons-globe-alt" class="size-4 text-(--ui-text-muted)" />
            <p class="truncate text-sm text-(--ui-text-muted) dark:text-gray-300">{{ siteDomain }}{{ currentPagePath }}</p>
          </div>
          <UBadge color="neutral" variant="subtle" size="xs">Preview</UBadge>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div class="relative mx-auto h-full min-h-[640px] max-w-7xl overflow-hidden rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-sm  ">
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
            <div class="flex items-center gap-3 rounded-lg border border-(--ui-border) bg-(--ui-bg) px-4 py-3 shadow-sm  ">
              <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin text-(--ui-text-muted)" />
              <p class="text-sm text-(--ui-text-muted) dark:text-gray-300">Loading preview...</p>
            </div>
          </div>
        </Transition>
      </div>
        </div>
      </main>

      <aside class="flex min-h-0 flex-col border-l border-(--ui-border) bg-(--ui-bg)  ">
        <div class="flex shrink-0 items-start justify-between border-b border-(--ui-border) px-4 py-3 ">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-(--ui-text-highlighted) ">
              {{ activeFieldDef?.label || 'Content settings' }}
            </p>
            <p class="truncate text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">
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
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-(--ui-text) dark:text-gray-200">{{ activeFieldDef.label }}</label>
            <UInput
              :id="`field-${activeField}`"
              v-model="editingValue"
              :placeholder="activeFieldDef?.placeholder || activeFieldDef?.defaultValue || 'Enter value...'"
              size="sm"
              class="w-full"
            />
            <p v-if="activeFieldDef?.defaultValue" class="text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Default: {{ activeFieldDef.defaultValue }}</p>
          </div>

          <div v-else-if="activeFieldDef?.type === 'textarea'" class="space-y-2">
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-(--ui-text) dark:text-gray-200">{{ activeFieldDef.label }}</label>
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
            <p v-if="activeFieldDef?.defaultValue" class="text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Default: {{ activeFieldDef.defaultValue }}</p>
          </div>

          <div v-else-if="activeFieldDef?.type === 'richtext'" class="space-y-2">
            <label :for="`field-${activeField}`" class="block text-sm font-medium text-(--ui-text) dark:text-gray-200">{{ activeFieldDef.label }}</label>
            <div class="flex flex-wrap gap-1 rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-1  dark:bg-gray-950">
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
            <div
              :id="`field-${activeField}`"
              contenteditable="true"
              class="prose prose-sm min-h-40 w-full max-w-none rounded-md border border-(--ui-border) bg-(--ui-bg) px-3 py-2 text-sm text-(--ui-text-highlighted) focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20  dark:bg-gray-950 "
              :data-placeholder="activeFieldDef?.placeholder || 'Start typing...'"
              v-html="DOMPurify.sanitize(editingValue || '')"
              @blur="onRichTextBlur"
            />
          </div>

          <UCard v-if="activeFieldRequiresGoogleUpgrade">
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--ui-bg-elevated) text-(--ui-primary)">
                  <UIcon name="i-simple-icons-google" class="size-5" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-(--ui-text-highlighted) ">Auto-sync from Google Business</p>
                  <p class="mt-1 text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Save hours keeping your site updated — connect once, sync forever.</p>
                </div>
              </div>
              <UButton to="/dashboard/billing" color="primary" block>
                Upgrade to Pro — $25/mo
              </UButton>
            </div>
          </UCard>

          <div
            v-else-if="activeFieldDef?.googleLocked"
            class="flex items-center gap-2 rounded-lg border border-(--ui-border) bg-(--ui-bg-muted) px-3 py-2 text-sm text-(--ui-text)  dark:bg-gray-950 dark:text-gray-200"
          >
            <UBadge color="neutral" variant="soft" size="sm">
              Synced from Google Business
            </UBadge>
            <span class="text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Manual edits remain available.</span>
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

                  </div>

        <div v-else class="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <div>
            <UIcon name="i-heroicons-cursor-arrow-rays" class="mx-auto mb-3 size-8 text-(--ui-text-dimmed)" />
            <p class="text-sm font-medium text-(--ui-text-highlighted) ">Select a field</p>
            <p class="mt-1 text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Choose editable content from the page structure.</p>
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
import DOMPurify from 'dompurify'
import { contentRegistry, editablePages, getFieldDef } from '~/config/content-registry'
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
const siteData = ref<any>(null)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const organizationEntitlements = ref<Record<string, any>>({})
const previewToken = ref('')
const siteName = computed(() => siteData.value?.name || 'Loading...')
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
    const response = await $fetch<{ context: any }>(`/api/editor/sites/${siteId}/context`)
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
const selectedLocationId = ref<string | null>(null)
const locationOptions = computed(() => [
  { id: null, label: 'All Locations' },
  ...siteLocations.value.map(location => ({
    id: location.id,
    label: location.is_primary ? `${location.title} (Primary)` : location.title
  }))
])
const selectedLocation = computed(() =>
  siteLocations.value.find(location => location.id === selectedLocationId.value) || null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title || 'All Locations')
const locationRequiredPageIds = new Set(['location', 'menu'])
const requiresLocationSelection = computed(() =>
  locationRequiredPageIds.has(selectedPageId.value) && !selectedLocation.value
)
const contentQuery = computed(() => {
  const params = new URLSearchParams()
  if (selectedLocationId.value) params.set('locationId', selectedLocationId.value)
  return params.toString()
})
const endpointWithContentScope = (path: string) =>
  contentQuery.value ? `${path}?${contentQuery.value}` : path

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
  iframeLoading.value = true
  activeField.value = null
  if (requiresLocationSelection.value) return
  loadPageContent()
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
    { id: 'hero',   label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle', 'hero.video'] },
    { id: 'cta',    label: 'Call to Action',  icon: 'i-heroicons-megaphone', fields: ['cta.title', 'cta.description'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.description', 'business.establishment_year'] },
    { id: 'contact', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] },
    { id: 'media', label: 'Gallery & Media', icon: 'i-heroicons-photo', fields: ['business.photos'] }
  ],
  about: [
    { id: 'hero',    label: 'Hero Section', icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'story',   label: 'Story',        icon: 'i-heroicons-book-open', fields: ['story.intro', 'journey.title', 'journey.body', 'experience.body'] },
    { id: 'cuisine', label: 'Cuisine',      icon: 'i-heroicons-sparkles', fields: ['grill.title', 'grill.description', 'sushi.title', 'sushi.description'] },
    { id: 'business',  label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.description', 'business.establishment_year'] }
  ],
  contact: [
    { id: 'hero',    label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Page Content',    icon: 'i-heroicons-document-text', fields: ['intro.body'] },
    { id: 'social',  label: 'Social Links',    icon: 'i-heroicons-link', fields: ['social.facebook', 'social.instagram', 'social.tiktok'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.establishment_year'] },
    { id: 'contact-hours', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] }
  ],
  location: [
    { id: 'hero',    label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Additional Info', icon: 'i-heroicons-document-text', fields: ['parking.info', 'extra.notes'] },
    { id: 'business', label: 'Business Info', icon: 'i-heroicons-building-storefront', fields: ['business.name', 'business.establishment_year'] },
    { id: 'contact-hours', label: 'Contact & Hours', icon: 'i-heroicons-clock', fields: ['business.address', 'business.phone', 'business.hours'] }
  ],
  menu: [
    { id: 'hero',    label: 'Hero Section',      icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Menu Introduction', icon: 'i-heroicons-document-text', fields: ['description'] },
    { id: 'media',  label: 'Gallery & Media',   icon: 'i-heroicons-photo', fields: ['business.products'] }
  ],
  reservations: [
    { id: 'hero',     label: 'Hero Section',    icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
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

const fieldSupportsGoogle = (fieldKey: string): boolean =>
  getFieldDef(selectedPageId.value, fieldKey)?.sources.includes('google') === true

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

const loadPageContent = async () => {
  if (requiresLocationSelection.value) return

  try {
    const res = await $fetch<{ content: any[]; hasDrafts: boolean }>(
      endpointWithContentScope(`/api/editor/sites/${siteId}/content/${selectedPageId.value}`)
    )
    const map: Record<string, string> = {}
    for (const row of res.content || []) {
      if (row.field === 'hero') {
        // Hero fields use dedicated columns
        if (row.hero_title) map['hero.title'] = row.hero_title
        if (row.hero_subtitle) map['hero.subtitle'] = row.hero_subtitle
        if (row.hero_video_url) map['hero.video'] = row.hero_video_url
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
  } catch (error: any) {
    const msg = error?.response?._data?.statusMessage || error.message || 'Unknown error'
    toast.add({ description: `Save failed: ${msg}`, color: 'error' })
    throw error // Re-throw so callers like handlePublish know it failed
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
  } catch (error: any) {
    const msg = error?.response?._data?.statusMessage || error.message || 'Unknown error'
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
  if (!raw) return fieldSupportsGoogle(fieldKey) ? 'Syncs from Google Business' : 'Add content'
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

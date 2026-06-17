<template>
  <div class="flex min-h-0 flex-col bg-elevated">
    <!-- Preview toolbar -->
    <div class="flex shrink-0 items-center gap-2.5 border-b border-default bg-default px-[18px] py-3">
      <!-- Page tabs -->
      <div class="flex gap-0.5 rounded-[11px] border border-default bg-muted p-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :disabled="!tab.enabled"
          :class="[
            'rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
            selectedPage === tab.id
              ? 'bg-default text-highlighted shadow-sm'
              : 'bg-transparent text-muted hover:text-highlighted',
            !tab.enabled && 'cursor-not-allowed opacity-35',
          ]"
          @click="tab.enabled && $emit('select-page', tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Location switcher (only for location-scoped pages) -->
      <button
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        class="inline-flex items-center gap-1.5 rounded-[10px] border border-default bg-default px-3 py-2 text-[12.5px] font-semibold text-highlighted shadow-sm transition-colors hover:border-default/80"
        @click="cycleLocation"
      >
        <UIcon name="i-heroicons-map-pin" class="size-3.5 text-primary" />
        {{ selectedLocationLabel }}
      </button>

      <!-- Status badge (pushed right) -->
      <div class="ml-auto flex items-center gap-2">
        <UBadge
          v-if="siteStatus === 'live'"
          color="success"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Live
        </UBadge>
        <UBadge
          v-else-if="siteStatus === 'ready'"
          color="primary"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Ready to launch
        </UBadge>
        <UBadge
          v-else-if="iframeSrc"
          color="warning"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Building
        </UBadge>

        <!-- Open in new tab -->
        <UButton
          v-if="iframeSrc"
          :href="iframeSrc"
          target="_blank"
          icon="i-heroicons-arrow-top-right-on-square"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Open preview"
        />
      </div>
    </div>

    <!-- Empty state (no site yet) -->
    <div v-if="!iframeSrc" class="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center text-muted">
      <div class="flex size-[60px] items-center justify-center rounded-2xl border border-default bg-default text-dimmed">
        <UIcon name="i-heroicons-globe-alt" class="size-7" />
      </div>
      <p class="text-[15px] font-semibold text-highlighted">Your site shows up here.</p>
      <p class="max-w-[30ch] text-[12.5px] leading-relaxed">
        Tell me where to start and I'll draft a homepage you can watch build in real time.
      </p>
    </div>

    <!-- Preview scroll area -->
    <div v-else class="min-h-0 flex-1 overflow-auto p-5">
      <!-- Browser chrome frame -->
      <div class="overflow-hidden rounded-2xl border border-default bg-default shadow-lg">
        <!-- Chrome bar -->
        <div class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-2">
          <div class="flex gap-[5px]">
            <i class="block size-[9px] rounded-full bg-default-300" />
            <i class="block size-[9px] rounded-full bg-default-300" />
            <i class="block size-[9px] rounded-full bg-default-300" />
          </div>
          <div class="flex h-6 flex-1 items-center gap-1.5 rounded-md border border-default bg-muted px-2.5 font-mono text-[10.5px] text-muted">
            <UIcon name="i-heroicons-lock-closed" class="size-2.5 text-dimmed" />
            {{ urlDisplay }}
          </div>
        </div>

        <!-- Iframe -->
        <div class="relative" style="min-height: 40rem">
          <iframe
            ref="previewFrame"
            :src="iframeSrc"
            class="h-full w-full border-0 transition-opacity duration-300"
            :class="{ 'opacity-40': iframeLoading }"
            style="min-height: 40rem"
            @load="iframeLoading = false"
          />
          <Transition
            enter-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-150"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none bg-elevated/60">
              <UCard :ui="{ body: 'px-4 py-3 sm:px-4 sm:py-3' }">
                <div class="flex items-center gap-3">
                  <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin text-muted" />
                  <p class="text-sm text-muted">Loading preview…</p>
                </div>
              </UCard>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  iframeSrc: string
  siteLocations: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
  selectedLocationId: string | null
  selectedPage: string
  siteStatus: 'setup' | 'progress' | 'ready' | 'live'
  siteDomain?: string
}>()

const emit = defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()

const previewFrame = ref<HTMLIFrameElement>()
const iframeLoading = ref(false)

watch(() => props.iframeSrc, (newSrc, oldSrc) => {
  if (newSrc && newSrc !== oldSrc) iframeLoading.value = true
}, { immediate: false })

const locationScopedPages = new Set(['location', 'menu'])

const tabs = computed(() => [
  { id: 'home',     label: 'Home',    enabled: !!props.iframeSrc },
  { id: 'menu',     label: 'Menu',    enabled: !!props.iframeSrc },
  { id: 'about',    label: 'About',   enabled: !!props.iframeSrc },
  { id: 'contact',  label: 'Contact', enabled: !!props.iframeSrc },
])

const currentTabIsLocationScoped = computed(() => locationScopedPages.has(props.selectedPage))

const selectedLocation = computed(() =>
  props.siteLocations.find(l => l.id === props.selectedLocationId) ?? props.siteLocations[0] ?? null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title ?? 'All locations')

const cycleLocation = () => {
  if (!props.siteLocations.length) return
  const idx = props.siteLocations.findIndex(l => l.id === props.selectedLocationId)
  const next = props.siteLocations[(idx + 1) % props.siteLocations.length]
  if (next) emit('select-location', next.id)
}

const urlDisplay = computed(() => {
  if (!props.iframeSrc) return ''
  try {
    const url = new URL(props.iframeSrc)
    // Show the clean domain/path, strip query params
    return url.hostname + (url.pathname !== '/' ? url.pathname : '')
  } catch {
    return props.iframeSrc
  }
})
</script>

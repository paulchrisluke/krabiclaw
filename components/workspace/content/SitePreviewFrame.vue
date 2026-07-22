<template>
  <UCard class="rounded-2xl shadow-lg" :ui="{ root: 'overflow-hidden', body: 'p-0 sm:p-0' }">
    <!-- Chrome bar -->
    <div class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-2">
      <div class="flex gap-[5px]">
        <i class="block size-[9px] rounded-full bg-default-300" />
        <i class="block size-[9px] rounded-full bg-default-300" />
        <i class="block size-[9px] rounded-full bg-default-300" />
      </div>
      <div class="flex h-6 flex-1 items-center gap-1.5 rounded-md border border-default bg-muted px-2.5 font-mono text-[10.5px] text-muted">
        <UIcon name="i-lucide-lock" class="size-2.5 text-dimmed" />
        {{ displayUrl }}
      </div>
      <div class="flex shrink-0 gap-0.5 rounded-md border border-default bg-muted p-0.5">
        <UButton
          v-for="mode in deviceModes"
          :key="mode.id"
          :icon="mode.icon"
          size="xs"
          square
          :color="device === mode.id ? 'primary' : 'neutral'"
          :variant="device === mode.id ? 'soft' : 'ghost'"
          :aria-label="mode.label"
          @click="device = mode.id"
        />
      </div>
    </div>

    <!-- Iframe -->
    <div class="overflow-auto bg-muted p-4">
      <div class="relative mx-auto transition-[max-width] duration-200" :class="deviceWidthClass" style="min-height: 40rem">
        <iframe
          id="site-preview-frame"
          ref="previewFrame"
          :src="iframeSrc"
          title="Site preview"
          class="h-full w-full border-0 bg-default transition-opacity duration-300"
          :class="{ 'opacity-40': iframeLoading }"
          style="min-height: 40rem"
          @load="iframeLoading = false"
          @error="iframeLoading = false"
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
                <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin text-muted" />
                <p class="text-sm text-muted">Loading preview…</p>
              </div>
            </UCard>
          </div>
        </Transition>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  iframeSrc: string
  /** The public-facing URL a visitor would actually see (tenant domain/
   *  subdomain + page path) — distinct from iframeSrc, which points at the
   *  internal /preview/site/:id route that actually serves draft content. */
  displayUrl: string
}>()

const previewFrame = ref<HTMLIFrameElement>()
// Starts true (not reset via the immediate watcher below) because iframeSrc
// commonly resolves in two steps — an initial value, then a recompute once
// an async token/context fetch lands — and firing the watcher immediately
// re-armed this flag right as the first real `load` event landed, before the
// second src change's own load event ever fired, leaving it stuck true.
const iframeLoading = ref(true)

watch(() => props.iframeSrc, (newSrc, oldSrc) => {
  if (newSrc && oldSrc && newSrc !== oldSrc) iframeLoading.value = true
})

const deviceModes = [
  { id: 'desktop', icon: 'i-lucide-monitor', label: 'Desktop' },
  { id: 'tablet', icon: 'i-lucide-tablet', label: 'Tablet' },
  { id: 'mobile', icon: 'i-lucide-smartphone', label: 'Mobile' },
] as const
const device = ref<(typeof deviceModes)[number]['id']>('desktop')
const deviceWidthClass = computed(() => {
  if (device.value === 'mobile') return 'max-w-[390px]'
  if (device.value === 'tablet') return 'max-w-[768px]'
  return 'max-w-none'
})

defineExpose({ previewFrame })
</script>

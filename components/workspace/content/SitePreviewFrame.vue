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
        {{ urlDisplay }}
      </div>
    </div>

    <!-- Iframe -->
    <div class="relative" style="min-height: 40rem">
      <iframe
        id="site-preview-frame"
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
              <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin text-muted" />
              <p class="text-sm text-muted">Loading preview…</p>
            </div>
          </UCard>
        </div>
      </Transition>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  iframeSrc: string
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

defineExpose({ previewFrame })
</script>

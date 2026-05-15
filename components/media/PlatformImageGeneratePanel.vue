<template>
  <div class="flex flex-col gap-4">
    <!-- Generated image area -->
    <div
      class="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-default"
      style="aspect-ratio: 4/3"
    >
      <!-- Generating shimmer -->
      <div
        v-if="generating"
        class="absolute inset-0 animate-pulse rounded-xl"
        style="background: linear-gradient(135deg, #f0e6ff 0%, #e6f0ff 50%, #ffe6f5 100%)"
      >
        <div class="absolute bottom-3 left-3 text-xs font-medium text-purple-400">{{ prompt }}</div>
      </div>

      <!-- Result -->
      <img
        v-else-if="result"
        :src="result.publicUrl"
        alt="Generated image"
        class="h-full w-full object-cover"
      />

      <!-- Empty state -->
      <div v-else class="flex h-full items-center justify-center bg-elevated">
        <UIcon name="i-heroicons-sparkles" class="size-8 text-muted" />
      </div>
    </div>

    <!-- Error -->
    <UAlert v-if="error" color="error" variant="soft" :description="error" icon="i-heroicons-exclamation-triangle" />

    <!-- Prompt input -->
    <div class="relative">
      <UInput
        v-model="prompt"
        :placeholder="result ? 'Ask a follow up…' : 'Describe your image…'"
        :disabled="generating"
        size="md"
        class="pr-10"
        @keydown.enter.prevent="generate"
      >
        <template #trailing>
          <UButton
            v-if="generating"
            icon="i-heroicons-stop-circle"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Stop"
            @click="stopGeneration"
          />
          <UButton
            v-else
            icon="i-heroicons-arrow-up"
            size="xs"
            color="primary"
            variant="ghost"
            :disabled="!prompt.trim()"
            aria-label="Generate"
            @click="generate"
          />
        </template>
      </UInput>
    </div>

    <!-- Previous results strip -->
    <div v-if="history.length > 1" class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="(item, i) in history"
        :key="i"
        type="button"
        :aria-label="historyAriaLabel(item, i)"
        class="size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all"
        :class="i === activeIdx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'"
        @click="activeIdx = i; result = item"
      >
        <img :src="item.publicUrl" alt="" class="h-full w-full object-cover" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  keep: [asset: { id: string; publicUrl: string; thumbnailUrl: string }]
  back: []
}>()

type GeneratedAsset = { id: string; publicUrl: string; thumbnailUrl: string }
type GeneratedHistoryItem = GeneratedAsset & { prompt?: string; description?: string }
const MAX_HISTORY = 50

const prompt = ref('')
const generating = ref(false)
const error = ref<string | null>(null)
const result = ref<GeneratedHistoryItem | null>(null)
const history = ref<GeneratedHistoryItem[]>([])
const activeIdx = ref(0)
const abortController = ref<AbortController | null>(null)

function historyAriaLabel(item: GeneratedHistoryItem, i: number): string {
  return item.prompt || item.description || `Generated image ${i + 1}`
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function stopGeneration() {
  abortController.value?.abort()
  generating.value = false
}

async function generate() {
  if (!prompt.value.trim() || generating.value) return

  const promptText = prompt.value.trim()
  abortController.value?.abort()
  const controller = new AbortController()
  abortController.value = controller

  generating.value = true
  error.value = null

  try {
    const asset = await $fetch<GeneratedAsset>(`/api/admin/ai/generate-image`, {
      method: 'POST',
      body: { prompt: promptText },
      signal: controller.signal,
    })

    if (controller.signal.aborted) return

    const historyItem: GeneratedHistoryItem = { ...asset, prompt: promptText }
    result.value = historyItem
    history.value.push(historyItem)
    if (history.value.length > MAX_HISTORY) {
      history.value.splice(0, history.value.length - MAX_HISTORY)
    }
    activeIdx.value = history.value.length - 1
    prompt.value = ''
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    error.value = getErrorMessage(err, 'Generation failed. Try a different prompt.')
  } finally {
    if (abortController.value === controller) {
      abortController.value = null
    }
    generating.value = false
  }
}

onUnmounted(() => {
  abortController.value?.abort()
})

defineExpose({
  canKeep: computed(() => !!result.value),
  keep: () => {
    const item = result.value
    if (item) {
      emit('keep', item)
      return item
    }
  },
})
</script>

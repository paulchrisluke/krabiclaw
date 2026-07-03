<template>
  <div class="flex flex-col gap-4">
    <!-- Generated image area -->
    <div
      class="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-default"
      style="aspect-ratio: 4/3"
    >
      <div
        v-if="generating"
        class="absolute inset-0 animate-pulse rounded-xl"
        style="background: linear-gradient(135deg, #f0e6ff 0%, #e6f0ff 50%, #ffe6f5 100%)"
      >
        <div class="absolute bottom-3 left-3 text-xs font-medium text-purple-400">{{ prompt }}</div>
      </div>

      <UImage
        v-else-if="result"
        :src="result.publicUrl"
        alt="Generated image"
        class="h-full w-full object-cover"
      />

      <div v-else class="flex h-full items-center justify-center bg-elevated">
        <UIcon name="i-heroicons-sparkles" class="size-8 text-muted" />
      </div>
    </div>

    <!-- Out of credits -->
    <div v-if="outOfCredits" class="rounded-lg border border-error-200 bg-error-50 dark:border-error-800 dark:bg-error-950 px-4 py-3 flex flex-col gap-3">
      <div class="flex items-center gap-2 text-sm text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-4 shrink-0" />
        <span class="font-medium">No AI credits remaining</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" color="error" variant="solid" :loading="buyingCredits === 500" :disabled="!!buyingCredits" @click="purchaseCredits(500)">500 — $9</UButton>
        <UButton size="sm" color="error" variant="soft" :loading="buyingCredits === 2500" :disabled="!!buyingCredits" @click="purchaseCredits(2500)">2,500 — $29</UButton>
        <UButton size="sm" color="error" variant="soft" :loading="buyingCredits === 5000" :disabled="!!buyingCredits" @click="purchaseCredits(5000)">5,000 — $49</UButton>
      </div>
    </div>

    <UAlert v-else-if="error" color="error" variant="soft" :description="error" icon="i-heroicons-exclamation-triangle" />

    <!-- Prompt textarea -->
    <UTextarea
      v-model="prompt"
      :placeholder="result ? 'Ask a follow up…' : 'Describe the dish, plating style, lighting…'"
      :disabled="generating || enhancing"
      :rows="3"
      autoresize
    />

    <!-- Actions row -->
    <div class="flex items-center justify-between gap-2">
      <UButton
        icon="i-heroicons-sparkles"
        size="sm"
        color="neutral"
        variant="soft"
        :loading="enhancing"
        :disabled="!prompt.trim() || generating"
        @click="enhance"
      >
        Enhance prompt
      </UButton>

      <UButton
        v-if="generating"
        icon="i-heroicons-stop-circle"
        size="sm"
        color="neutral"
        variant="outline"
        @click="stopGeneration"
      >
        Stop
      </UButton>
      <UButton
        v-else
        icon="i-heroicons-arrow-up"
        size="sm"
        :disabled="!prompt.trim()"
        @click="generate"
      >
        Generate
      </UButton>
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
        <UImage :src="item.publicUrl" alt="" class="h-full w-full object-cover" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  siteId: string
  locationId?: string | null
  initialPrompt?: string
  context?: string
}>()

const emit = defineEmits<{
  keep: [asset: { id: string; publicUrl: string; thumbnailUrl: string }]
  back: []
}>()

const { trackMediaGenerated } = useAnalytics()

type GeneratedAsset = { id: string; publicUrl: string; thumbnailUrl: string }
type GeneratedHistoryItem = GeneratedAsset & { prompt?: string }
const MAX_HISTORY = 50

const prompt = ref('')
const generating = ref(false)
const enhancing = ref(false)
const error = ref<string | null>(null)
const outOfCredits = ref(false)
const buyingCredits = ref<number | null>(null)
const result = ref<GeneratedHistoryItem | null>(null)
const history = ref<GeneratedHistoryItem[]>([])
const activeIdx = ref(0)
const abortController = ref<AbortController | null>(null)

const { purchase: purchaseCreditsFn } = useCreditPurchase()

async function purchaseCredits(bundle: 500 | 2500 | 5000) {
  buyingCredits.value = bundle
  try {
    await purchaseCreditsFn(bundle, () => { outOfCredits.value = false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to purchase credits. Please try again.'
    error.value = msg
  } finally {
    buyingCredits.value = null
  }
}

onMounted(() => {
  if (props.initialPrompt) prompt.value = props.initialPrompt
})

function historyAriaLabel(item: GeneratedHistoryItem, i: number): string {
  return item.prompt || `Generated image ${i + 1}`
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

async function enhance() {
  if (!prompt.value.trim() || enhancing.value) return
  enhancing.value = true
  error.value = null
  try {
    const res = await $fetch<{ enhanced: string }>(`/api/dashboard/ai/enhance-prompt`, {
      method: 'POST',
      body: { prompt: prompt.value.trim(), context: props.context ?? '' },
    })
    if (res.enhanced) prompt.value = res.enhanced
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to enhance prompt')
  } finally {
    enhancing.value = false
  }
}

async function generate() {
  if (!prompt.value.trim() || generating.value) return

  const promptText = prompt.value.trim()
  abortController.value?.abort()
  const controller = new AbortController()
  abortController.value = controller

  generating.value = true
  error.value = null
  outOfCredits.value = false

  try {
    const asset = await $fetch<GeneratedAsset>(`/api/dashboard/ai/generate-image`, {
      method: 'POST',
      body: { prompt: promptText, locationId: props.locationId ?? undefined },
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
    trackMediaGenerated(props.siteId, promptText)
    prompt.value = ''
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 402) {
      outOfCredits.value = true
      return
    }
    error.value = getErrorMessage(err, 'Generation failed. Try a different prompt.')
  } finally {
    if (abortController.value === controller) abortController.value = null
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

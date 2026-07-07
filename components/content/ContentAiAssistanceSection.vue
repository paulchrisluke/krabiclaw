<template>
  <section v-if="prompts.length" class="space-y-4">
    <div class="rounded-2xl border border-default bg-elevated/40 p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-default text-default">
              <PlatformIcon name="sparkles" class="size-4" />
            </span>
            <h2 class="text-xl font-semibold text-default">{{ label || 'AI Assistance' }}</h2>
          </div>
          <p v-if="intro" class="mt-2 text-sm text-muted">{{ intro }}</p>
        </div>
      </div>

      <div class="mt-5 grid gap-4" :class="prompts.length > 1 ? 'lg:grid-cols-2' : ''">
        <article
          v-for="(item, index) in prompts"
          :key="`ai-prompt-${index}`"
          class="rounded-xl border border-default bg-default p-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 v-if="item.title" class="text-base font-semibold text-default">{{ item.title }}</h3>
              <p v-if="item.description" class="mt-1 text-sm text-muted">{{ item.description }}</p>
            </div>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-md border border-default px-3 py-1.5 text-sm font-medium text-default transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              @click="copyPrompt(item.prompt, index)"
            >
              <PlatformIcon name="copy" class="size-4" />
              <span>{{ copiedIndex === index ? 'Copied' : item.copyLabel }}</span>
            </button>
          </div>

          <pre
            class="mt-4 overflow-hidden whitespace-pre-wrap break-words rounded-lg bg-elevated p-3 font-mono text-sm leading-6 text-default"
            :style="promptStyle(index, item.prompt)"
          >{{ item.prompt }}</pre>

          <button
            v-if="shouldCollapse(item.prompt)"
            type="button"
            class="mt-3 text-sm font-medium text-(--kc-teal) hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            @click="toggleExpanded(index)"
          >
            {{ expanded[index] ? 'Show less' : 'Show more' }}
          </button>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  label?: string | null
  intro?: string | null
  collapsed?: boolean | null
  maxVisibleLines?: number | null
  prompts: Array<{
    title: string | null
    prompt: string
    description: string | null
    copyLabel: string
  }>
}>()

const copiedIndex = ref<number | null>(null)
const expanded = reactive<Record<number, boolean>>({})

const visibleLines = computed(() => Math.max(1, Math.min(12, props.maxVisibleLines ?? 4)))

function promptLineCount(prompt: string) {
  return prompt.split(/\r?\n/).length
}

function shouldCollapse(prompt: string) {
  if (props.collapsed === false) return false
  return promptLineCount(prompt) > visibleLines.value || prompt.length > visibleLines.value * 96
}

function promptStyle(index: number, prompt: string) {
  if (!shouldCollapse(prompt) || expanded[index]) return {}
  return { maxHeight: `${visibleLines.value * 1.5}rem` }
}

function toggleExpanded(index: number) {
  expanded[index] = !expanded[index]
}

async function copyPrompt(prompt: string, index: number) {
  await navigator.clipboard.writeText(prompt)
  copiedIndex.value = index
  window.setTimeout(() => {
    if (copiedIndex.value === index) copiedIndex.value = null
  }, 1800)
}
</script>

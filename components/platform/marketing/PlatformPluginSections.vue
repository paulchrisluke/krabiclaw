<template>
  <!-- The three capability cards under the plugin header. -->
  <div v-if="variant === 'capabilities'" class="mt-16 grid gap-6 md:grid-cols-3" data-parity-section="capabilities">
    <UCard v-for="item in items" :key="item.title">
      <template #header><h2 class="text-lg font-bold">{{ item.title }}</h2></template>
      <p class="text-sm leading-relaxed text-muted">{{ item.description }}</p>
    </UCard>
  </div>

  <!-- The numbered connection steps, the MCP URL with its copy button inside step two. -->
  <section v-else-if="variant === 'steps'" class="mx-auto mt-20 max-w-4xl border-t border-default px-4 pt-14 sm:px-6" data-parity-section="connect">
    <h2 class="text-3xl font-extrabold text-default">{{ title }}</h2>
    <p v-if="description" class="mt-3 text-muted">{{ description }}</p>

    <ol class="mt-10 grid gap-6 md:grid-cols-3">
      <li v-for="(step, index) in steps" :key="step.name" class="rounded-2xl border border-default bg-elevated p-6">
        <span class="flex size-10 items-center justify-center rounded-xl text-lg font-bold text-white" :class="STEP_TILES[index % STEP_TILES.length]">{{ index + 1 }}</span>
        <h3 class="mt-4 font-bold text-default">{{ step.name }}</h3>
        <TenantPageMarkdown :content="step.text" class="mt-2 text-sm leading-relaxed text-muted" />
        <div v-if="stepUrl(step)" class="mt-4 flex items-center gap-2 rounded-xl border border-default bg-muted/50 px-3 py-2 font-mono text-xs">
          <span class="truncate">{{ stepUrl(step) }}</span>
          <button type="button" class="ml-auto cursor-pointer" aria-label="Copy MCP server URL" @click="copy(stepUrl(step)!)">
            <PlatformIcon :name="copied ? 'check' : 'clipboard'" class="size-4" />
          </button>
        </div>
      </li>
    </ol>
    <slot />
  </section>

  <!-- A callout card: the safe first request. -->
  <div v-else class="mt-10 rounded-2xl border border-default bg-elevated p-6" data-parity-section="first-request">
    <h3 class="font-bold text-default">{{ title }}</h3>
    <TenantPageMarkdown :content="body" class="mt-2 text-sm text-muted [&>p+p]:mt-4" />
  </div>
</template>

<script setup lang="ts">
/**
 * The plugin page's three sections after its header. The MCP endpoint is
 * whatever URL a step's text names — the page states it once, in the step
 * that tells you where to paste it — and the copy button copies that.
 */
const props = withDefaults(defineProps<{
  variant: 'capabilities' | 'steps' | 'callout'
  title?: string | null
  description?: string | null
  body?: string | null
  items?: Array<{ title: string; description: string }>
  steps?: Array<{ name: string; text: string }>
}>(), {
  title: null,
  description: null,
  body: null,
  items: () => [],
  steps: () => [],
})

const STEP_TILES = ['bg-(--kc-navy)', 'bg-(--kc-teal)', 'bg-(--kc-coral)'] as const

function stepUrl(step: { text: string }): string | null {
  const match = step.text.match(/https:\/\/[^\s)]+\/api\/mcp/)
  return match ? match[0] : null
}

const copied = ref(false)
async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (error) {
    console.error('Failed to copy MCP server URL', error)
  }
}
void props
</script>

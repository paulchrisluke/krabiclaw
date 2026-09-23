<template>
  <!-- The three capability cards under the plugin header. -->
  <div v-if="variant === 'capabilities'" class="mt-16 grid gap-6 md:grid-cols-3" data-parity-section="capabilities">
    <div v-for="item in items" :key="item.title" class="rounded-2xl border border-default bg-elevated p-6">
      <h2 class="text-lg font-bold">{{ item.title }}</h2>
      <p class="mt-3 text-sm leading-relaxed text-muted">{{ item.description }}</p>
    </div>
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
            <PlatformIcon :name="copyFailed ? 'x' : copied ? 'check' : 'clipboard'" class="size-4" />
          </button>
        </div>
        <p v-if="copyFailed" class="mt-1 text-xs text-error" role="status">Your browser blocked the clipboard — select the URL above and copy it.</p>
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
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull, blockRecords } from '~/utils/tenant-page-block-data'
/**
 * The plugin page's three sections after its header. The MCP endpoint is
 * whatever URL a step's text names — the page states it once, in the step
 * that tells you where to paste it — and the copy button copies that.
 */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const title = computed(() => blockTextOrNull(props.block.data.title))
const description = computed(() => blockTextOrNull(props.block.data.description))
const body = computed(() => blockTextOrNull(props.block.data.body))
const items = computed(() => blockRecords(props.block.data.items)
  .map(item => ({ title: blockText(item.title), description: blockText(item.description) }))
  .filter(item => item.title))
const steps = computed(() => blockRecords(props.block.data.steps)
  .map(step => ({ name: blockText(step.name), text: blockText(step.text) }))
  .filter(step => step.name))
/** This block is the connection walkthrough; the other looks it had are their own types now. */
const variant = computed<'capabilities' | 'steps' | 'callout'>(() => 'steps')

const STEP_TILES = ['bg-(--kc-navy)', 'bg-(--kc-teal)', 'bg-(--kc-coral)'] as const

function stepUrl(step: { text: string }): string | null {
  const match = step.text.match(/https:\/\/[^\s)]+\/api\/mcp/)
  return match ? match[0] : null
}

const copied = ref(false)
const copyFailed = ref(false)
async function copy(url: string) {
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // The clipboard is denied often enough that throwing here would be wrong,
    // but the reader has to be told: the button previously did nothing at all
    // and said nothing, so they pasted whatever was already on the clipboard.
    copyFailed.value = true
    setTimeout(() => { copyFailed.value = false }, 4000)
  }
}
void props
</script>

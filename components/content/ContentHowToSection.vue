<template>
  <section class="space-y-4">
    <div class="space-y-3">
      <div>
        <h2 class="text-2xl font-semibold text-default">{{ label || 'How To' }}</h2>
        <p class="mt-1 text-sm text-muted">Complete the task with these ordered steps.</p>
      </div>

      <div v-if="hasMeta" class="flex flex-wrap gap-2 text-sm text-muted">
        <span v-if="estimatedTime" class="rounded-full border border-default px-3 py-1">
          {{ humanizeDuration(estimatedTime) }}
        </span>
        <span v-for="item in toolItems" :key="`tool-${item}`" class="rounded-full border border-default px-3 py-1">
          Tool: {{ item }}
        </span>
        <span v-for="item in supplyItems" :key="`supply-${item}`" class="rounded-full border border-default px-3 py-1">
          Supply: {{ item }}
        </span>
      </div>
    </div>

    <div class="space-y-4">
      <div v-for="(step, index) in steps" :key="`howto-${index}`" class="rounded-2xl border border-default p-5">
        <div class="flex items-start gap-4">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-default">
            {{ index + 1 }}
          </div>
          <div class="min-w-0 flex-1 space-y-3">
            <div>
              <h3 class="text-lg font-medium text-default">{{ step.name }}</h3>
              <a v-if="safeStepUrl(step.url)" :href="safeStepUrl(step.url)" class="text-sm text-(--kc-teal) hover:underline">{{ step.url }}</a>
              <span v-else-if="step.url" class="text-sm text-muted">{{ step.url }}</span>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="prose max-w-none text-muted dark:prose-invert" v-html="step.textHtml" />
            <UImage
              v-if="step.image_public_url"
              :src="step.image_public_url"
              :alt="step.name"
              class="max-h-72 w-full rounded-xl object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { sanitizeUrl } from '~/utils/sanitize'

const props = defineProps<{
  label?: string | null
  estimatedTime?: string | null
  toolItems?: string[]
  supplyItems?: string[]
  steps: Array<{
    name: string
    url: string | null
    image_public_url: string | null
    image_width?: number | null
    image_height?: number | null
    textHtml: string
  }>
}>()

const hasMeta = computed(() =>
  Boolean(props.estimatedTime)
  || Boolean(props.toolItems?.length)
  || Boolean(props.supplyItems?.length),
)

function safeStepUrl(url: string | null | undefined) {
  const sanitized = sanitizeUrl(url)
  return sanitized.startsWith('http://') || sanitized.startsWith('https://') ? sanitized : ''
}

// schema.org wants the raw ISO 8601 duration (handled separately in
// useContentPageSchema.ts) — this only formats the on-page badge.
function humanizeDuration(iso: string): string {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return iso
  const [, hours, minutes, seconds] = match
  const parts: string[] = []
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  if (seconds) parts.push(`${seconds} sec`)
  return parts.length ? parts.join(' ') : iso
}
</script>

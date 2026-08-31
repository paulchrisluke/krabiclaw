<template>
  <main class="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
    <p v-if="eyebrow" class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
      {{ eyebrow }}
    </p>
    <h1 class="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
      {{ title }}
    </h1>
    <p v-if="summary" class="mt-5 max-w-3xl text-lg leading-8 text-muted">
      {{ summary }}
    </p>
    <div v-if="body" class="mt-10 max-w-3xl whitespace-pre-wrap text-base leading-8">
      {{ body }}
    </div>
    <dl v-if="details.length" class="mt-10 grid gap-5 sm:grid-cols-2">
      <div v-for="detail in details" :key="detail.key" class="rounded-xl border border-default p-5">
        <dt class="text-sm font-medium text-muted">{{ detail.label }}</dt>
        <dd class="mt-2 whitespace-pre-wrap">{{ detail.value }}</dd>
      </div>
    </dl>
  </main>
</template>

<script setup lang="ts">
import type { LocalizedPublicRoute } from '~/server/utils/localization'

const props = defineProps<{ route: LocalizedPublicRoute }>()
const values = computed(() => props.route.representation.kind === 'resource'
  ? props.route.representation.localization.values
  : {})
const firstString = (...keys: string[]) => {
  for (const key of keys) {
    const value = values.value[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}
const title = computed(() => firstString('name', 'title', 'brand_name', 'question', 'label'))
const summary = computed(() => firstString('tagline', 'summary', 'short_description', 'description', 'answer'))
const body = computed(() => firstString('body'))
const eyebrow = computed(() => firstString('category', 'event_title'))
const hiddenKeys = new Set([
  'name', 'title', 'brand_name', 'question', 'label', 'tagline', 'summary', 'short_description',
  'description', 'answer', 'body', 'category', 'event_title', 'seo_title', 'seo_description',
])
const details = computed(() => Object.entries(values.value)
  .filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== '' && !key.startsWith('seo_'))
  .map(([key, value]) => ({
    key,
    label: key.replaceAll('_', ' '),
    value: typeof value === 'string' ? value : JSON.stringify(value),
  })))

useSocialMetadata(() => ({
  path: props.route.route_path,
  title: firstString('seo_title') || title.value,
  description: firstString('seo_description') || summary.value,
  brand: {
    siteName: String(props.route.site.values.brand_name || ''),
  },
}))
</script>

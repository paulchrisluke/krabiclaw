<template>
  <AppSection v-if="title || description || (url && label)" bg="default" padding="lg">
    <div class="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
      <div class="max-w-3xl">
        <h2 v-if="title" class="saya-display saya-italic text-5xl leading-none text-default">{{ title }}</h2>
        <div v-if="description" class="mt-5 max-w-2xl text-sm leading-7 text-muted">{{ description }}</div>
      </div>
      <div class="flex flex-wrap gap-4">
        <NuxtLink
          v-if="url && label"
          :to="route(url)"
          class="inline-flex items-center justify-center rounded-full bg-(--brand-color) px-6 py-3 text-base font-medium text-(--brand-color-foreground) no-underline transition hover:opacity-90"
        >
          {{ label }}
        </NuxtLink>
      </div>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, isInternalRoute } from '~/utils/tenant-page-block-data'

// Saya's call to action. The words and the button are the block's — they used
// to be substituted at render time from the vertical's copy table, so the
// button the visitor clicked was not anything the owner had written or could
// change.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()

const title = computed(() => blockText(props.block.data.title))
const description = computed(() => blockText(props.block.data.description))
const label = computed(() => blockText(props.block.data.label))
const url = computed(() => blockText(props.block.data.url))

/** An internal route takes the visitor's locale; an absolute URL is left alone. */
function route(url: string) {
  return isInternalRoute(url) ? localePath(url) : url
}
</script>

<template>
  <div
    class="rounded-3xl border border-default bg-elevated text-center shadow-sm"
    :class="size === 'lg' ? 'p-10 sm:p-16 max-w-4xl mx-auto flex flex-col items-center gap-6' : 'p-8 sm:p-12 space-y-6'"
    data-parity-section="cta"
  >
    <h2 class="font-extrabold text-default m-0" :class="size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-3xl'">{{ title }}</h2>
    <p v-if="description" class="text-muted m-0" :class="size === 'lg' ? 'text-base sm:text-lg max-w-xl leading-relaxed' : 'text-base max-w-lg mx-auto'">{{ description }}</p>
    <div class="flex gap-4" :class="size === 'lg' ? 'flex-wrap' : 'justify-center'">
      <PlatformAccountCta v-if="label" :label="label" :to="url || '/signup'" size="lg" :class="size === 'lg' ? 'shadow-sm' : ''" />
      <PlatformButton v-if="secondaryLabel && secondaryUrl" :to="secondaryUrl" variant="outline" size="lg">{{ secondaryLabel }}</PlatformButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull } from '~/utils/tenant-page-block-data'
/**
 * The closing call to action: a title, a line, the account button and an
 * outline button. The vertical pages draw it large; About draws it at the
 * size of its other cards.
 */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const title = computed(() => blockText(props.block.data.title))
const description = computed(() => blockTextOrNull(props.block.data.description))
const label = computed(() => blockTextOrNull(props.block.data.label))
const url = computed(() => blockTextOrNull(props.block.data.url))
const secondaryLabel = computed(() => blockTextOrNull(props.block.data.secondary_label))
const secondaryUrl = computed(() => blockTextOrNull(props.block.data.secondary_url))
/**
 * A page whose whole job is to sell one vertical closes large; a prompt inside
 * a page that is about something else reads at the size of its other cards.
 */
const LARGE_PAGES = new Set(['/', '/restaurants', '/experiences', '/legal'])
const size = computed<'md' | 'lg'>(() => (LARGE_PAGES.has(props.page.path) ? 'lg' : 'md'))
</script>

<template>
  <section class="relative bg-white pb-14 pt-14 sm:pb-20 sm:pt-14 lg:pb-14" :data-parity-section="paritySection">
    <div class="blawby-container relative z-20">
      <BlawbySectionHeading
        :title="title"
        :accent="accent"
        :description="description"
        centered
      />
      <BlawbyPageGrid :items="items" class="mt-20" />
    </div>
    <img v-if="decorationUrl" :src="decorationUrl" alt="" width="1920" height="400" loading="lazy" class="absolute bottom-0 w-full object-contain object-center">
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords, blockMedia } from '~/utils/tenant-page-block-data'
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

/** A decoration the block carries, which is the page's own art, not content. */
const decorationUrl = computed(() => blockMedia(props.block, 'decoration')[0]?.public_url ?? null)

/**
 * The pages this section links to, exactly as the block resolved them. No
 * reshaping: the block already carries each page's title, summary, route and
 * media, and re-deriving a slug from the route was how a card came to point at
 * a path nobody published.
 */
const items = computed(() => blockRecords(props.block.data.items).map(item => ({
  id: blockText(item.id),
  title: blockText(item.title),
  description: blockText(item.description) || undefined,
  url: blockText(item.url),
  media: (Array.isArray(item.media) ? item.media : []).map(media => ({
    slot: blockText((media as Record<string, unknown>).slot),
    public_url: blockText((media as Record<string, unknown>).public_url),
  })).filter(media => media.slot && media.public_url),
})).filter(item => item.id && item.title && item.url))
const title = computed(() => blockText(props.block.data.title))
const accent = computed(() => blockText(props.block.data.accent))
const description = computed(() => blockText(props.block.data.description))
const paritySection = computed(() => 'services')
</script>

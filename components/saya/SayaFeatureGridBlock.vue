<template>
  <!-- The site's published articles. -->
  <AppSection v-if="source === 'organization_posts' && items.length" bg="black" padding="xl">
    <div class="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-2xl">
        <p class="saya-kicker mb-6 text-inverted/60">{{ kicker }}</p>
        <h2 class="saya-display-md text-inverted">{{ heading }}</h2>
      </div>
      <NuxtLink :to="localePath('/blog')" class="inline-flex text-sm font-medium text-inverted no-underline hover:underline">
        {{ t('saya.footer.visit_page') }}
      </NuxtLink>
    </div>
    <div class="grid gap-6 lg:grid-cols-3">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="route(item.url)"
        class="group block overflow-hidden rounded-xl border border-inverted/10 bg-inverted/5 no-underline transition hover:-translate-y-0.5 hover:border-inverted/20"
      >
        <div v-if="item.image" class="aspect-4/3 overflow-hidden bg-inverted/10">
          <img :src="item.image" :alt="item.alt" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105">
        </div>
        <div class="p-6">
          <h3 class="text-2xl font-semibold leading-tight text-inverted">{{ item.title }}</h3>
          <p v-if="item.description" class="mt-3 text-sm leading-relaxed text-inverted/60">{{ item.description }}</p>
          <p class="mt-4 text-sm font-medium text-inverted">{{ t('saya.posts.read_full_story') }}</p>
        </div>
      </NuxtLink>
    </div>
  </AppSection>

  <!-- Rows the owner wrote. -->
  <AppSection v-else-if="items.length" padding="xl">
    <div v-if="heading || kicker" class="mb-16 max-w-2xl">
      <p v-if="kicker" class="saya-kicker mb-6">{{ kicker }}</p>
      <h2 v-if="heading" class="saya-display-md text-default">{{ heading }}</h2>
    </div>
    <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="item in items" :key="item.id" class="border border-default p-8">
        <img v-if="item.image" :src="item.image" :alt="item.alt" loading="lazy" class="mb-6 size-14 object-cover">
        <h3 class="saya-display saya-italic text-3xl leading-none text-default">{{ item.title }}</h3>
        <p v-if="item.description" class="mt-4 text-sm leading-relaxed text-muted">{{ item.description }}</p>
      </article>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockRecords, isInternalRoute } from '~/utils/tenant-page-block-data'

// One grid, two sets of rows: the site's published articles, or rows the
// owner wrote. Short posts are their own block, social_posts. Which it is, is a field the owner picks —
// it used to be three separate sections hardcoded into the homepage, so a site
// could neither reorder them nor leave one out.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath, t } = useI18n()
const source = computed(() => blockText(props.block.data.source) || 'manual')
const kicker = computed(() => blockText(props.block.data.description)
  || (source.value === 'organization_posts' ? t('saya.footer.blog') : ''))
const heading = computed(() => blockText(props.block.data.title)
  || (source.value === 'organization_posts' ? t('saya.posts.title') : ''))

const items = computed(() => blockRecords(props.block.data.items).map((item, index) => {
  const media = blockRecords(item.media)[0] ?? null
  return {
    id: blockText(item.id) || String(index),
    title: blockText(item.title),
    description: blockText(item.description),
    url: blockText(item.url),
    image: blockText(media?.kind) === 'video' ? blockText(media?.thumbnail_url) : blockText(media?.public_url),
    alt: blockText(media?.alt_text) || blockText(item.title),
  }
}).filter(item => item.title || item.description))

/** An internal route takes the visitor's locale; an absolute URL is left alone. */
function route(url: string) {
  return isInternalRoute(url) ? localePath(url) : url
}
</script>

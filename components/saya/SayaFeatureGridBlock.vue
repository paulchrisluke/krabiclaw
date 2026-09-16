<template>
  <!--
    The site's social posts. The first tile is wide, videos start when they
    scroll into view, and each tile links to the post's own page.
  -->
  <section v-if="source === 'site_updates' && items.length" class="bg-elevated">
    <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div class="mb-16 max-w-2xl">
        <p class="saya-kicker mb-6">{{ kicker }}</p>
        <h2 class="saya-display-md text-default">{{ heading }}</h2>
      </div>
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="(item, index) in items"
          :key="item.id"
          :to="route(item.url)"
          class="group block overflow-hidden bg-default text-default no-underline transition hover:opacity-90"
          :class="index === 0 ? 'sm:col-span-2' : ''"
        >
          <div
            v-if="item.image"
            :ref="item.kind === 'video' ? (el: Element | { $el?: Element } | null) => setVideoRef(el, item.id) : undefined"
            class="overflow-hidden bg-muted"
            :class="index === 0 ? 'aspect-video' : 'aspect-square'"
          >
            <video
              v-if="item.kind === 'video' && visibleVideos.has(item.id)"
              :src="item.image"
              :poster="item.poster || undefined"
              autoplay muted loop playsinline preload="none"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <img
              v-else
              :src="item.kind === 'video' ? item.poster || item.image : item.image"
              :alt="item.alt"
              loading="lazy" decoding="async"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            >
          </div>
          <div class="p-5 pt-4">
            <p class="saya-eyebrow mb-2 text-muted">{{ homeCopy.postsEyebrow }}</p>
            <p class="line-clamp-3 text-sm leading-relaxed text-default">{{ item.description || item.title }}</p>
            <p class="mt-3 saya-eyebrow text-muted opacity-60">{{ homeCopy.readMoreCta }}</p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>

  <!-- The site's published articles. -->
  <AppSection v-else-if="source === 'site_posts' && items.length" bg="black" padding="xl">
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

// One grid, three sets of rows: the site's social posts, its published
// articles, or rows the owner wrote. Which it is, is a field the owner picks —
// it used to be three separate sections hardcoded into the homepage, so a site
// could neither reorder them nor leave one out.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath, locale, t } = useI18n()
const { site } = useTenantSite()

const homeCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const source = computed(() => blockText(props.block.data.source) || 'manual')
const kicker = computed(() => blockText(props.block.data.description)
  || (source.value === 'site_updates' ? homeCopy.value.latelyKicker : source.value === 'site_posts' ? t('saya.footer.blog') : ''))
const heading = computed(() => blockText(props.block.data.title)
  || (source.value === 'site_updates' ? homeCopy.value.highlightsSectionHeading : source.value === 'site_posts' ? t('saya.posts.title') : ''))

const items = computed(() => blockRecords(props.block.data.items).map((item, index) => {
  const media = blockRecords(item.media)[0] ?? null
  return {
    id: blockText(item.id) || String(index),
    title: blockText(item.title),
    description: blockText(item.description),
    url: blockText(item.url),
    image: blockText(media?.public_url),
    poster: blockText(media?.thumbnail_url),
    kind: blockText(media?.kind) || 'image',
    alt: blockText(media?.alt_text) || blockText(item.title),
  }
}).filter(item => item.title || item.description))

// A post video starts when its tile reaches the viewport; the poster is in the
// SSR HTML from the first byte.
const visibleVideos = ref(new Set<string>())
const videoRefs = new Map<string, HTMLElement>()
let observer: IntersectionObserver | null = null

function setVideoRef(el: Element | { $el?: Element } | null, id: string) {
  const node = el && ('$el' in el ? el.$el : el)
  if (!(node instanceof HTMLElement)) return
  videoRefs.set(id, node)
  observer?.observe(node)
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const id = [...videoRefs.entries()].find(([, node]) => node === entry.target)?.[0]
      if (!id) continue
      visibleVideos.value = new Set([...visibleVideos.value, id])
      observer?.unobserve(entry.target)
    }
  }, { rootMargin: '200px' })
  videoRefs.forEach(node => observer?.observe(node))
})

onBeforeUnmount(() => observer?.disconnect())

/** An internal route takes the visitor's locale; an absolute URL is left alone. */
function route(url: string) {
  return isInternalRoute(url) ? localePath(url) : url
}
</script>

<template>
  <AppSection :bg="bg" :padding="padding">
    <div class="mb-12 flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-2xl">
        <p class="saya-kicker mb-6">{{ sectionKicker }}</p>
        <h2 class="saya-display-md text-default">{{ sectionHeading }}</h2>
      </div>
      <NuxtLink
        v-if="items.length"
        :to="linkTarget"
        class="border-b border-default pb-1 text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
      >
        View all →
      </NuxtLink>
    </div>
    <div v-if="items.length" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <NuxtLink
        v-for="(item, i) in items"
        :key="i"
        :to="item.href || linkTarget"
        class="group block overflow-hidden bg-elevated no-underline text-default transition hover:opacity-90"
      >
        <div class="aspect-square overflow-hidden bg-muted">
          <video
            v-if="item.imageKind === 'video' && item.image && clientReady"
            :src="item.image"
            autoplay
            muted
            loop
            playsinline
            preload="none"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <img
            v-else-if="item.image"
            :src="item.image"
            :srcset="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? cfImageSrcset(item.image) : undefined"
            :sizes="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? '(max-width:640px) 50vw, 25vw' : undefined"
            :alt="item.alt"
            loading="lazy"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div v-else class="flex h-full w-full items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="size-8 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09m8.445-7.188L18 9.75l-.259-1.035a3.38 3.38 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.38 3.38 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.38 3.38 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.38 3.38 0 0 0-2.456 2.456m-1.365 11.852L16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183l.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394l-1.183.394a2.25 2.25 0 0 0-1.423 1.423"/></svg>
          </div>
        </div>
        <div class="p-3 pt-2">
          <p class="saya-display saya-italic text-base text-default leading-snug line-clamp-2">{{ item.name }}</p>
          <p v-if="item.price" class="mt-0.5 text-xs tabular-nums text-muted">{{ item.price }}</p>
        </div>
      </NuxtLink>
    </div>
    <template v-else>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SayaEmptyExample v-for="(example, i) in emptyState.examples" :key="i" :item="example" aspect="square" />
      </div>
      <SayaMcpHint :hint="emptyState.hint" />
    </template>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import SayaEmptyExample from '~/components/saya/SayaEmptyExample.vue'
import SayaMcpHint from '~/components/saya/SayaMcpHint.vue'
import { sayaEmptyStates } from '~/config/saya-empty-states'

interface Props {
  data?: {
    items?: Array<{
      name: string
      image?: string
      imageKind?: string
      alt?: string
      price?: string
      href?: string
    }>
    hasMenu?: boolean
    vertical?: string
  }
  bg?: string
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({ items: [], hasMenu: false, vertical: undefined }),
  bg: 'default',
  padding: 'lg'
})

const { site } = useTenantSite()

const items = computed(() => props.data?.items || [])
const hasMenu = computed(() => props.data?.hasMenu || false)
const linkTarget = computed(() => hasMenu.value ? '/menu' : '/experiences')

const emptyState = computed(() => hasMenu.value ? sayaEmptyStates.menu : sayaEmptyStates.experiences)

const sectionKicker = computed(() => hasMenu.value ? 'The menu' : 'Experiences')
const sectionHeading = computed(() => {
  const siteRecord = site as Record<string, unknown>
  const brandName = typeof siteRecord?.brand_name === 'string' ? siteRecord.brand_name : null
  if (hasMenu.value) {
    return `What we're cooking at ${brandName || 'our kitchen'}.`
  }
  return `What we're offering at ${brandName || 'our studio'}.`
})

const clientReady = ref(false)
onMounted(() => { clientReady.value = true })
</script>

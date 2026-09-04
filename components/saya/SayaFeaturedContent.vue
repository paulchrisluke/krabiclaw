<template>
  <AppSection v-if="items.length && !allUnavailable" :bg="bg" :padding="padding">
    <div class="mb-12 flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-2xl">
        <p class="saya-kicker mb-6">{{ data.kicker }}</p>
        <h2 class="saya-display-md text-default">{{ data.heading }}</h2>
      </div>
      <NuxtLink
        v-if="items.length && linkTarget"
        :to="localePath(linkTarget)"
        class="border-b border-default pb-1 text-xs uppercase tracking-widest text-default no-underline transition hover:opacity-60"
      >
        {{ t('saya.common.view_all') }} →
      </NuxtLink>
    </div>
    <div v-if="items.length" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <NuxtLink
        v-for="(item, i) in items"
        :key="i"
        :to="localePath(item.href || '')"
        class="group relative block overflow-hidden bg-elevated no-underline text-default transition hover:opacity-90"
      >
        <div v-if="item.image" class="relative aspect-square overflow-hidden bg-muted">
          <SayaBadgeUnavailable
            v-if="item.unavailable"
            overlay
            :text="t('saya.common.temporarily_unavailable')"
          />
          <img
            :src="item.image"
            :srcset="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? cfImageSrcset(item.image) ?? undefined : undefined"
            :sizes="item.image.includes('imagedelivery.net') || item.image.includes('cloudflare') ? '(max-width:640px) 50vw, 25vw' : undefined"
            :alt="item.alt"
            loading="lazy"
            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div class="p-3 pt-2">
          <p class="saya-display saya-italic text-base text-default leading-snug line-clamp-2">{{ item.name }}</p>
          <p v-if="item.price" class="mt-0.5 flex items-baseline gap-1.5 text-xs tabular-nums text-muted">
            <span v-if="item.compareAtPrice" class="line-through">{{ item.compareAtPrice }}</span>
            <span>{{ item.price }}</span>
          </p>
        </div>
      </NuxtLink>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import { cfImageSrcset } from '~/utils/cf-image'

interface Props {
  data?: {
    items?: Array<{
      name: string
      image?: string | null
      alt?: string
      price?: string | null
      compareAtPrice?: string | null
      href?: string
      unavailable?: boolean
    }>
    kicker: string
    heading: string
    linkTarget?: string | null
  }
  bg?: string
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({ items: [], kicker: '', heading: '' }),
  bg: 'default',
  padding: 'lg'
})
const { localePath, t } = useI18n()

const items = computed(() => (props.data?.items || []).filter(item => Boolean(item.href)))
// A location-wide closure marks every item unavailable at once — showing a
// row of all-badged cards reads as broken, so hide the whole section instead.
const allUnavailable = computed(() => {
  const list = items.value
  return list.length > 0 && list.every(item => item.unavailable)
})
const linkTarget = computed(() => props.data?.linkTarget || '')
</script>

<template>
  <div class="border-b border-default bg-default">
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-14 items-center gap-2 overflow-x-auto scrollbar-none">
        <NuxtLink
          v-for="item in items"
          :key="item.key"
          :to="item.href"
          :aria-current="active === item.key ? 'page' : undefined"
          :class="[
            'shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition-all',
            active === item.key
              ? 'bg-inverted text-inverted'
              : 'text-muted hover:bg-muted hover:text-default'
          ]"
        >
          {{ item.label }}
        </NuxtLink>
      </div>

      <!-- Fade indicators for mobile scroll -->
      <div class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-default to-transparent lg:hidden" />
      <div class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-default to-transparent lg:hidden" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { resolveLocationExperienceHref } from '~/utils/experience-navigation'
import { resolveProductPresentation, productLocationCollectionPath } from '~/utils/product-presentation'

const props = defineProps<{
  locationSlug: string
  active: 'overview' | 'menu' | 'products' | 'experiences' | 'posts' | 'reviews' | 'photos' | 'qa' | 'contact'
}>()

const { products, experiencesList, location } = await usePublicPageData({ lazy: false })
const { site } = useTenantSite()
const { t } = useI18n()

const productPresentation = computed(() => resolveProductPresentation((site as ApiRecord | null)?.vertical as string | null | undefined))

const items = computed(() => {
  const list = [
    { key: 'overview', label: t('saya.subnav.overview'), href: `/locations/${props.locationSlug}` }
  ]
  if (location.value && products.value.some(product => product.location_id === location.value?.id) && productPresentation.value) {
    list.push({
      key: productPresentation.value.locationCollectionSegment,
      label: productPresentation.value.collectionLabel,
      href: productLocationCollectionPath((site as ApiRecord | null)?.vertical as string | null | undefined, props.locationSlug),
    })
  }
  const experiencesHref = resolveLocationExperienceHref(props.locationSlug, experiencesList.value)
  if (experiencesHref) {
    list.push({ key: 'experiences', label: t('saya.subnav.experiences'), href: experiencesHref })
  }
  list.push(
    { key: 'posts',    label: t('saya.subnav.posts'),   href: `/locations/${props.locationSlug}/posts` },
    { key: 'reviews',  label: t('saya.subnav.reviews'), href: `/locations/${props.locationSlug}/reviews` },
    { key: 'photos',   label: t('saya.subnav.photos'),  href: `/locations/${props.locationSlug}/photos` },
    { key: 'qa',       label: t('saya.subnav.qa'),      href: `/locations/${props.locationSlug}/qa` },
    { key: 'contact',  label: t('saya.subnav.visit'),   href: `/locations/${props.locationSlug}/contact` }
  )
  return list
})
</script>

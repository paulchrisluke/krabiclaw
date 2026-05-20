<template>
  <NuxtLayout name="saya">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">

      <!-- Header -->
      <div class="mb-16 max-w-2xl">
        <p class="saya-kicker mb-4">Experiences</p>
        <h1 class="saya-display-md text-default">Dine differently.</h1>
        <p class="mt-5 text-base leading-relaxed text-muted">
          Exclusive culinary events, chef encounters, and one-of-a-kind dining moments — crafted for guests who want more than a meal.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="animate-pulse">
          <div class="aspect-[4/3] rounded-lg bg-muted" />
          <div class="mt-4 h-4 w-2/3 rounded bg-muted" />
          <div class="mt-2 h-3 w-full rounded bg-muted" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="!experiences.length" class="py-24 text-center text-muted">
        <p class="text-sm">No experiences available right now. Check back soon.</p>
      </div>

      <!-- Grid -->
      <div v-else class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="exp in experiences"
          :key="exp.id"
          :to="`/experiences/${exp.slug}`"
          class="group block no-underline"
        >
          <div class="relative overflow-hidden rounded-lg bg-muted aspect-[4/3]">
            <img
              v-if="exp.image_url"
              :src="exp.image_url"
              :alt="exp.title"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div v-else class="flex h-full items-center justify-center">
              <UIcon name="i-heroicons-sparkles" class="size-12 text-dimmed" />
            </div>
            <div
              v-if="exp.status === 'sold_out'"
              class="absolute inset-0 flex items-center justify-center bg-black/50"
            >
              <span class="rounded-full bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-default">
                Sold Out
              </span>
            </div>
          </div>

          <div class="mt-5">
            <h2 class="text-lg font-semibold text-default group-hover:text-primary transition-colors">
              {{ exp.title }}
            </h2>
            <p v-if="exp.tagline" class="mt-1 text-sm text-muted line-clamp-2">{{ exp.tagline }}</p>

            <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
              <span v-if="exp.price" class="flex items-center gap-1">
                <UIcon name="i-heroicons-banknotes" class="size-3.5" />
                {{ exp.price }}
              </span>
              <span v-if="exp.duration_minutes" class="flex items-center gap-1">
                <UIcon name="i-heroicons-clock" class="size-3.5" />
                {{ formatDuration(exp.duration_minutes) }}
              </span>
              <span v-if="exp.max_capacity" class="flex items-center gap-1">
                <UIcon name="i-heroicons-user-group" class="size-3.5" />
                {{ exp.max_capacity }} guests max
              </span>
            </div>

            <div class="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              View experience
              <UIcon name="i-heroicons-arrow-right" class="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { Experience } from '~/server/utils/experiences'

const { isPlatform, siteId, site } = useTenantSite()
const siteName = computed(() => (site as ApiValue)?.name || 'KrabiClaw')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const { data, pending } = isPlatform || !siteId
  ? { data: ref(null), pending: ref(false) }
  : await useFetch(`/api/public/sites/${siteId}/experiences`, {
      key: `experiences-${siteId}`,
      server: true,
    })

const experiences = computed<Experience[]>(() => (data.value as ApiValue)?.experiences ?? [])
const currentPageUrl = useSeoUrl('/experiences')
const ogImage = useSharedOgImage(() => experiences.value[0]?.image_url)

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Experiences', url: `${siteUrl}/experiences` },
])

useSeoMeta({
  title: computed(() => `Experiences | ${siteName.value}`),
  description: computed(() => `Book exclusive dining experiences at ${siteName.value} — chef's table events, tasting menus, and more. Reserve your spot today.`),
  ogUrl: currentPageUrl,
  ogType: 'website',
  ogImage,
})
</script>

<template>
  <NuxtLayout name="saya">
    <div v-if="!isPlatform">
      <!-- No order links configured — redirect feel -->
      <div v-if="!hasOrderLinks" class="flex min-h-96 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <UIcon name="i-heroicons-shopping-bag" class="size-12 text-muted" />
        <div>
          <h1 class="text-2xl font-bold text-default">Online ordering not available</h1>
          <p class="mt-2 text-muted">We'd love to see you in person.</p>
        </div>
        <UButton to="/reservations" size="lg" color="primary" class="rounded-full">Reserve a Table</UButton>
      </div>

      <template v-else>
        <SayaHero
          :title="getField('hero.title', 'Order Online')"
          :subtitle="getField('hero.subtitle', 'Get our food delivered to your door')"
          size="page"
        />

        <AppSection bg="white" padding="xl">
          <!-- Single location: centred platform buttons -->
          <div v-if="orderableLocations.length === 1" class="mx-auto max-w-lg text-center">
            <div class="flex flex-wrap justify-center gap-4">
              <a
                v-for="link in platformLinks(orderableLocations[0])"
                :key="link.label"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-6 py-3 text-sm font-semibold text-default shadow-sm transition hover:bg-muted"
              >
                {{ link.label }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4 text-muted" />
              </a>
            </div>
          </div>

          <!-- Multi-location: cards -->
          <div v-else class="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            <div
              v-for="loc in orderableLocations"
              :key="loc.id"
              class="rounded-2xl border border-default bg-elevated p-6"
            >
              <h3 class="text-lg font-bold text-default">{{ loc.title }}</h3>
              <p v-if="loc.city" class="mt-1 text-sm text-muted">{{ loc.city }}</p>
              <div class="mt-5 flex flex-wrap gap-3">
                <a
                  v-for="link in platformLinks(loc)"
                  :key="link.label"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm font-semibold text-default transition hover:bg-muted"
                >
                  {{ link.label }}
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5 text-muted" />
                </a>
              </div>
            </div>
          </div>

          <!-- Reservations fallback link -->
          <p class="mt-12 text-center text-sm text-muted">
            Prefer to dine in?
            <NuxtLink to="/reservations" class="font-medium text-default underline-offset-4 hover:underline">Reserve a table</NuxtLink>
          </p>
        </AppSection>
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

import { usePageContent } from '~/composables/usePageContent'

const { isPlatform, siteId } = useTenantSite()
const { getField } = usePageContent('order')
const route = useRoute()
const requestURL = useRequestURL()

const { data: locationsData } = isPlatform || !siteId
  ? { data: ref({ locations: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/locations`, {
      key: `order-locs-${siteId}`,
      default: () => ({ locations: [] })
    })

const allLocations = computed(() => locationsData.value?.locations ?? [])

const platformLinks = (loc) => [
  { label: 'Grab', url: loc.grab_url },
  { label: 'Uber Eats', url: loc.uber_eats_url },
  { label: 'FoodPanda', url: loc.foodpanda_url },
].filter(l => l.url)

const orderableLocations = computed(() =>
  allLocations.value.filter(loc => platformLinks(loc).length > 0)
)

const hasOrderLinks = computed(() => orderableLocations.value.length > 0)

useSeoMeta({
  title: computed(() => `Order Online | ${getField('restaurant.name', 'Our Restaurant')}`),
  description: 'Order our food online for delivery.',
  ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
})
</script>

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
        <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
          <p class="saya-kicker mb-6">Order</p>
          <h1 class="saya-display-md text-default">
            <em class="saya-italic">{{ getField('hero.title', 'Order online') }}</em>
          </h1>
          <p v-if="getField('hero.subtitle')" class="mt-5 max-w-xl text-sm leading-relaxed text-muted">{{ getField('hero.subtitle') }}</p>
        </header>

        <section class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <!-- Single location: centred platform buttons -->
          <div v-if="orderableLocations.length === 1" class="max-w-lg">
            <div class="flex flex-wrap gap-4">
              <a
                v-for="link in platformLinks(orderableLocations[0])"
                :key="link.label"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-6 py-3 text-sm font-medium text-default transition hover:bg-muted"
              >
                {{ link.label }}
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4 text-muted" />
              </a>
            </div>
          </div>

          <!-- Multi-location: cards -->
          <div v-else class="grid gap-6 sm:grid-cols-2">
            <div
              v-for="loc in orderableLocations"
              :key="loc.id"
              class="border border-default bg-elevated p-8"
            >
              <h3 class="saya-display saya-italic text-2xl text-default leading-none">{{ loc.title }}</h3>
              <p v-if="loc.city || loc.neighborhood" class="saya-eyebrow mt-3 text-muted">{{ loc.neighborhood || loc.city }}</p>
              <div class="mt-6 flex flex-wrap gap-3">
                <a
                  v-for="link in platformLinks(loc)"
                  :key="link.label"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm font-medium text-default transition hover:bg-muted"
                >
                  {{ link.label }}
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5 text-muted" />
                </a>
              </div>
            </div>
          </div>

          <p class="mt-16 text-sm text-muted">
            Prefer to dine in?
            <NuxtLink to="/reservations" class="font-medium text-default underline-offset-4 hover:underline">Reserve a table →</NuxtLink>
          </p>
        </section>
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()
const { getField, locations } = useBootstrap()

const allLocations = computed(() => locations.value)

const platformLinks = (loc) => [
  { label: 'Grab', url: loc.grab_url },
  { label: 'Uber Eats', url: loc.uber_eats_url },
  { label: 'FoodPanda', url: loc.foodpanda_url },
].filter(l => l.url)

const orderableLocations = computed(() =>
  allLocations.value.filter(loc => platformLinks(loc).length > 0)
)

const hasOrderLinks = computed(() => orderableLocations.value.length > 0)
const sharedOgImage = useSharedOgImage()
const route = useRoute()
const requestURL = useRequestURL()

useSeoMeta({
  title: computed(() => `Order Online | ${getField('restaurant.name', 'Our Restaurant')}`),
  description: 'Order our food online for delivery.',
  ogImage: sharedOgImage,
  ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
})
</script>

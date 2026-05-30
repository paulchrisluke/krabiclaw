<template>
  <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div class="mb-16 max-w-2xl">
      <p class="saya-kicker mb-6">Find us</p>
      <h2 class="saya-display-md text-default">
        {{ data.heading }}
      </h2>
    </div>
    <!-- Real locations -->
    <div v-if="data.locations.length > 0" :class="['grid gap-8', data.locations.length > 1 ? 'md:grid-cols-2' : '']">
      <NuxtLink
        v-for="(loc, i) in data.locations"
        :key="loc.id"
        :ref="el => { if (el) cardRefs[i] = el as HTMLElement }"
        :to="`/locations/${loc.slug}`"
        class="group block overflow-hidden border border-default text-default no-underline transition hover:border-muted"
      >
        <div class="aspect-video overflow-hidden bg-muted">
          <ClientOnly v-if="loc.kind === 'video'">
            <template v-if="visibleCards.has(i)">
              <video
                :src="loc.public_url"
                :poster="loc.hero_video_thumbnail_url || undefined"
                class="aspect-video w-full object-cover"
                :autoplay="i === 0"
                muted loop playsinline preload="none"
              />
            </template>
            <template v-else>
              <img
                v-if="loc.hero_video_thumbnail_url || loc.public_url"
                :src="loc.hero_video_thumbnail_url || loc.public_url"
                :alt="loc.title"
                class="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </template>
          </ClientOnly>
          <img
            v-else-if="loc.public_url"
            :src="loc.public_url"
            :alt="loc.title"
            class="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-105"
          >
          <div v-else class="flex h-full w-full items-center justify-center">
            <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
          </div>
        </div>
        <div class="p-8 pb-9">
          <div v-if="loc.city" class="saya-eyebrow mb-5 flex items-center gap-2 text-muted">
            <span class="size-1.5 rounded-full bg-zinc-300" />
            {{ loc.city }}
          </div>
          <div class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</div>
          <div class="mt-6 border-t border-default pt-5">
            <span class="saya-eyebrow text-muted">Visit this location →</span>
          </div>
        </div>
      </NuxtLink>
    </div>
    <!-- Empty state: no locations yet -->
    <div v-else class="grid gap-8 md:grid-cols-2">
      <div
        v-for="i in 2"
        :key="i"
        class="overflow-hidden border border-dashed border-default"
      >
        <div class="flex aspect-video items-center justify-center bg-muted">
          <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
        </div>
        <div class="p-8 pb-9">
          <div class="saya-display saya-italic text-4xl text-muted leading-none">
            {{ i === 1 ? 'Main location' : 'Second location' }}
          </div>
          <p class="mt-4 text-sm text-muted">
            {{ i === 1 ? 'Connect Google Business to sync your address, hours, photos and reviews.' : 'Add a second location once your first is connected.' }}
          </p>
        </div>
      </div>
      <div v-if="data.isAuthenticated" class="md:col-span-2 text-center pt-2">
        <UButton to="/dashboard" color="neutral" variant="outline" size="sm" class="rounded-full">
          Connect Google Business →
        </UButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
interface Props {
  data: {
    locations: Array<{
      id: string
      slug: string
      title: string
      city?: string
      public_url?: string
      kind?: string
      hero_video_thumbnail_url?: string
    }>
    heading: string
    isAuthenticated: boolean
  }
}

const props = defineProps<Props>()

const cardRefs = ref<HTMLElement[]>([])
const visibleCards = ref(new Set<number>())

onMounted(() => {
  if (!('IntersectionObserver' in window)) return

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const i = cardRefs.value.indexOf(entry.target as HTMLElement)
      if (i >= 0) {
        visibleCards.value = new Set([...visibleCards.value, i])
        observer.unobserve(entry.target)
      }
    })
  }, { rootMargin: '200px' })

  watch(cardRefs, (refs) => {
    refs.forEach(el => el && observer.observe(el))
  }, { immediate: true })

  onUnmounted(() => observer.disconnect())
})
</script>

<template>
  <section class="relative isolate overflow-hidden bg-[var(--blawby-primary-dark)]" data-parity-section="approach">
    <svg class="absolute inset-0 -z-10 size-full stroke-white/10" aria-hidden="true">
      <defs><pattern id="blawby-grid" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M.5 200V.5H200" fill="none" /></pattern></defs>
      <rect width="100%" height="100%" fill="url(#blawby-grid)" stroke-width="0" />
    </svg>
    <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div class="grid grid-cols-1 items-center gap-x-8 gap-y-16 lg:grid-cols-2">
        <div>
          <div class="border-b border-gray-200 pb-10">
            <h2 class="blawby-display text-3xl font-bold text-white sm:text-4xl">{{ title }}</h2>
            <p v-if="accent" class="mt-2 blawby-display text-3xl font-bold text-[var(--blawby-accent)] sm:text-4xl">{{ accent }}</p>
          </div>
          <dl class="mt-10 space-y-10">
            <div v-for="feature in features" :key="feature.name">
              <dt class="blawby-display text-xl font-bold text-white">{{ feature.name }}</dt>
              <dd class="mt-3 text-sm leading-6 text-white">{{ feature.desc }}</dd>
            </div>
          </dl>
        </div>
        <div>
          <div class="aspect-video overflow-hidden rounded-lg bg-gray-100">
            <iframe
              v-if="videoUrl"
              :title="videoTitle || title"
              :src="videoUrl"
              loading="lazy"
              allow="encrypted-media"
              allowfullscreen
              class="size-full"
            />
          </div>
          <div v-if="images.length" class="mt-4 grid grid-cols-2 gap-4 sm:mt-6 sm:gap-6 lg:mt-8 lg:gap-8">
            <img v-for="image in images" :key="image.url" :src="image.url" :alt="image.alt || ''" width="600" height="400" loading="lazy" class="aspect-square w-full rounded-lg object-cover">
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  accent?: string | null
  videoUrl?: string | null
  videoTitle?: string | null
  features: Array<{ name: string; desc: string }>
  images: Array<{ url: string; alt?: string | null }>
}>()
</script>

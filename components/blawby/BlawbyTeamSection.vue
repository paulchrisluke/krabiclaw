<template>
  <section v-if="people.length" class="bg-[var(--blawby-accent-200)] pb-16" data-parity-section="team">
    <div v-if="features.length" class="relative pb-16 pt-4 sm:pb-16 sm:pt-4 lg:pb-16">
      <div class="blawby-container">
        <div class="relative z-20 mt-4 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="feature in features" :key="feature.title" class="relative h-full rounded-2xl bg-white p-6 shadow-xl shadow-slate-900/10">
            <div class="size-16 rounded-lg">
              <img v-if="feature.icon_url" :src="feature.icon_url" :alt="feature.title" width="64" height="64" loading="eager" class="size-16 rounded object-cover">
            </div>
            <h3 class="mt-4 blawby-display text-xl font-bold uppercase text-[var(--blawby-primary)]">{{ feature.title }}</h3>
            <p class="mt-4 text-sm text-[var(--blawby-primary)]">{{ feature.description }}</p>
          </article>
        </div>
      </div>
    </div>
    <div class="mx-auto max-w-7xl px-6 lg:px-8">
      <ul class="-mt-12 space-y-12 divide-y divide-gray-200" role="list">
        <li v-for="person in people" :key="`${person.first_name}-${person.last_name}`" class="flex flex-col gap-10 pt-12 sm:flex-row">
          <img v-if="person.image_url" :src="person.image_url" :alt="`${person.first_name} ${person.last_name}`" width="640" height="480" loading="lazy" class="w-2/5 flex-none rounded-2xl object-cover">
          <div class="max-w-xl flex-auto">
            <h3 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">{{ person.first_name }} {{ person.last_name }}</h3>
            <p v-if="person.title" class="text-base leading-7 text-gray-600">{{ person.title }}</p>
            <div v-if="person.bio" class="mt-6 text-base leading-7 text-[var(--blawby-primary)]">
              <div class="flex items-start gap-3">{{ person.bio }}</div>
            </div>
            <BlawbyButton v-if="person.url" :to="person.url" class="mt-6">
              <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
              Request a Consultation
            </BlawbyButton>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  features: Array<{
    title: string
    description: string
    icon_url?: string | null
  }>
  people: Array<{
    first_name: string
    last_name: string
    title?: string | null
    bio?: string | null
    url?: string | null
    image_url?: string | null
  }>
}>()
</script>

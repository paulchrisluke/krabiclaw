<template>
  <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Services</p>
    <h1 class="mt-4 blawby-display text-5xl text-[var(--blawby-primary)]">Legal Services Offered</h1>
    <p class="mt-5 max-w-2xl text-base leading-8 text-slate-600">
      Explore practice areas and service paths, then request a consultation when you are ready to talk through next steps.
    </p>

    <div v-if="offerings.length" class="mt-12 grid gap-6 md:grid-cols-2">
      <NuxtLink
        v-for="offering in offerings"
        :key="offering.id"
        :to="`/services/${offering.slug}`"
        class="grid gap-5 border border-[var(--blawby-border)] bg-white p-6 no-underline transition hover:border-[var(--blawby-accent)] lg:grid-cols-[180px_1fr]"
      >
        <img v-if="offering.thumbnail_url" :src="offering.thumbnail_url" :alt="offering.name" class="aspect-[4/3] w-full object-cover">
        <div>
          <h2 class="blawby-display text-3xl text-[var(--blawby-primary)]">{{ offering.name }}</h2>
          <p class="mt-3 text-sm leading-7 text-slate-600">{{ offering.summary || offering.short_description }}</p>
          <span class="mt-5 inline-block text-sm font-semibold text-[var(--blawby-accent-strong)]">Learn more</span>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="mt-12 border border-[var(--blawby-border)] bg-white p-8 text-slate-600">
      Services will appear here once they are published.
    </div>
  </section>
</template>

<script setup lang="ts">
const { offerings } = useBlawbySite()
const { site } = useTenantSite()

useSeoMeta({
  title: computed(() => `Services | ${site?.brand_name || 'Professional services'}`),
  description: 'Explore professional services and practice areas.',
})
</script>

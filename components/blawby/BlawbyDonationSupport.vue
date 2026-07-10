<template>
  <section class="bg-white py-16" data-parity-section="donation">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <BlawbyImpactSection v-if="impact" v-bind="impact" :parity-section="null" compact />

      <div v-if="destination" class="mb-4 flex justify-center">
        <BlawbyButton :to="destination" class="px-8 py-4 text-lg" @click="$emit('click')">{{ label }}</BlawbyButton>
      </div>

      <div v-if="support" class="rounded-2xl py-16">
        <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
          <article class="rounded-2xl bg-[var(--blawby-accent-100)] p-8 shadow-sm">
            <h2 class="blawby-display text-2xl font-bold text-[var(--blawby-primary-dark)]">{{ support.difference.title }}</h2>
            <p class="mt-4 text-[var(--blawby-primary-800)]">{{ support.difference.description }}</p>
            <ul class="mt-8 space-y-4">
              <li v-for="item in support.difference.items" :key="item" class="flex items-start">
                <span class="inline-flex size-6 items-center justify-center rounded-full bg-white text-[var(--blawby-accent)]">&#10003;</span>
                <span class="ml-3 text-[var(--blawby-primary)]">{{ item }}</span>
              </li>
            </ul>
          </article>

          <article class="rounded-2xl bg-[var(--blawby-accent-100)] p-8 shadow-sm">
            <h2 class="blawby-display text-2xl font-bold text-[var(--blawby-primary-dark)]">{{ support.other_ways.title }}</h2>
            <p class="mt-4 text-[var(--blawby-primary-800)]">{{ support.other_ways.description }}</p>
            <ul class="mt-8 space-y-4">
              <li v-for="item in support.other_ways.items" :key="item.title" class="group">
                <NuxtLink :to="item.url" class="flex w-full items-center rounded-xl p-4 no-underline transition hover:bg-white hover:ring-1 hover:ring-[var(--blawby-accent)]">
                  <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--blawby-accent)]">
                    <BlawbyFeatureIcon :name="item.icon" class="size-5" />
                  </span>
                  <span class="ml-4">
                    <span class="block font-semibold text-[var(--blawby-primary-dark)]">{{ item.title }}</span>
                    <span class="mt-1 block text-sm text-[var(--blawby-primary)]">{{ item.description }}</span>
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  impact: {
    title: string
    description?: string | null
    additionalDescription?: string | null
    statistics: Array<{ value: string; label: string }>
  } | null
  support: {
    difference: { title: string; description: string; items: string[] }
    other_ways: { title: string; description: string; items: Array<{ title: string; description: string; url: string; icon: string }> }
  } | null
  destination?: string | null
  label: string
}>()

defineEmits<{ click: [] }>()
</script>

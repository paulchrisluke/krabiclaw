<template>
  <section class="relative isolate overflow-hidden bg-[var(--blawby-primary-800)] py-16 sm:py-20" data-parity-section="consultation">
    <div class="absolute inset-0 -z-10">
      <img v-if="backgroundUrl" :src="backgroundUrl" alt="" width="1920" height="1080" loading="lazy" class="size-full object-cover object-bottom">
      <div class="absolute inset-0 bg-[var(--blawby-primary-dark)]/10" />
    </div>
    <div class="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-4xl text-center">
        <div class="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-sm">
          <div class="mx-auto max-w-3xl">
            <h2 class="blawby-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">{{ title }}</h2>
            <div class="mt-8 space-y-6 text-lg leading-8 text-white/90">
              <p class="whitespace-pre-line">{{ description }}</p>
              <p v-if="priceLine" class="font-semibold text-white">{{ priceLine }}</p>
            </div>
            <div class="mt-10 flex justify-center">
              <BlawbyButton :to="destination" class="gap-2 px-8 py-4 text-lg" @click="$emit('click')">
                <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>
                {{ label }}
              </BlawbyButton>
            </div>
            <p v-if="notice" class="mt-6 text-sm text-white/80">{{ notice }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description: string
  priceLine?: string | null
  notice?: string | null
  label: string
  destination: string
  backgroundUrl?: string | null
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <section class="relative overflow-hidden bg-black py-32" data-parity-section="consultation">
    <img v-if="backgroundUrl" :src="backgroundUrl" alt="" loading="lazy" class="absolute inset-0 size-full object-cover">
    <div class="blawby-container relative flex flex-col-reverse items-center lg:flex-row">
      <div class="w-full lg:w-1/2 lg:pl-16 lg:pr-8">
        <h2 class="blawby-display text-center text-3xl font-bold text-white sm:text-4xl lg:text-left">{{ title }}</h2>
        <p v-if="description" class="mt-4 text-center text-lg leading-8 text-white lg:text-left">{{ description }}</p>
        <div class="mt-10 text-center lg:text-left">
          <BlawbyButton :to="destination" class="gap-2" @click="$emit('click')">
            <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
            {{ label }}
          </BlawbyButton>
        </div>
      </div>
      <div v-if="featuredUrl" class="w-full lg:w-1/2 lg:max-w-[300px] lg:pl-24">
        <div class="hidden justify-center lg:flex">
          <img :src="featuredUrl" alt="" width="300" height="370" loading="lazy" class="max-h-[370px] object-contain">
        </div>
        <div class="flex justify-center lg:hidden">
          <img :src="featuredUrl" alt="" width="300" height="370" loading="lazy" class="max-h-[120px] object-contain">
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string | null
  label: string
  destination: string
  backgroundUrl?: string | null
  featuredUrl?: string | null
}>()

defineEmits<{ click: [] }>()
</script>

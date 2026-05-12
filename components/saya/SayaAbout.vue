<template>
  <AppSection :bg="bg" :padding="padding">
    <div :class="[isTeaser ? 'grid md:grid-cols-2 items-center gap-12' : 'max-w-4xl mx-auto']">
      <div :class="['relative overflow-hidden shadow-2xl transition-all duration-700', isTeaser ? 'rounded-2xl h-80 order-2' : 'rounded-3xl h-[600px] mb-16']">
        <img
          v-if="image"
          :src="image"
          :alt="imageAlt || title || 'About our restaurant'"
          class="w-full h-full object-cover hover:scale-105 transition-transform duration-1000"
        >
        <div v-else class="w-full h-full bg-(--ui-bg-muted) flex items-center justify-center border-2 border-dashed border-(--ui-border)">
          <span class="text-(--ui-text-muted) italic">Authentic Experience</span>
        </div>
      </div>

      <div :class="[isTeaser ? 'order-1' : 'text-center md:text-left']">
        <h2
          v-if="showTitle"
          :class="['font-bold mb-8', isTeaser ? 'text-3xl text-(--ui-text-inverted)' : 'text-5xl md:text-6xl text-(--ui-text) italic tracking-tighter leading-none']"
        >
          {{ title || 'Our Story' }}
        </h2>

        <div :class="['prose prose-lg max-w-none', isTeaser ? 'text-(--ui-text-inverted)' : 'text-(--ui-text) mx-auto']">
          <slot>
            <p :class="['leading-relaxed mb-8', isTeaser ? 'text-lg' : 'text-xl font-medium text-(--ui-text) leading-relaxed']">
              {{ description || 'Experience the essence of Japanese culinary tradition in the heart of Krabi.' }}
            </p>
          </slot>

          <div v-if="!isTeaser" class="mt-16 pt-12 border-t border-(--ui-border) text-center">
            <p class="font-bold italic text-3xl text-(--ui-text) tracking-tight">
              "Happy Guest, Happy Restaurant"
            </p>
          </div>
        </div>

        <div v-if="isTeaser" class="mt-10">
          <UButton
            to="/about"
            :variant="bg === 'black' ? 'outline' : 'solid'"
            color="neutral"
            size="xl"
            class="rounded-full"
          >
            Our Full Story
          </UButton>
        </div>
      </div>
    </div>
  </AppSection>
</template>

<script setup>
defineProps({
  title: { type: String, default: null },
  description: { type: String, default: null },
  image: { type: String, default: null },
  imageAlt: { type: String, default: null },
  isTeaser: { type: Boolean, default: false },
  bg: { type: String, default: 'white' },
  padding: { type: String, default: 'lg' },
  showTitle: { type: Boolean, default: true }
})
</script>

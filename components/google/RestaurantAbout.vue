<template>
  <AppSection :bg="bg" :padding="padding">
    <div :class="[isTeaser ? 'grid md:grid-cols-2 items-center gap-12' : 'max-w-4xl mx-auto']">
      <!-- Image Section -->
      <div :class="['relative overflow-hidden shadow-2xl transition-all duration-700', isTeaser ? 'rounded-2xl h-80 order-2' : 'rounded-3xl h-[600px] mb-16']">
        <img 
          v-if="image" 
          :src="image" 
          :alt="title || 'KIKUZUKI'" 
          class="w-full h-full object-cover hover:scale-105 transition-transform duration-1000"
        />
        <div v-else class="w-full h-full bg-stone-100 flex items-center justify-center border-2 border-dashed border-stone-200">
          <span class="text-stone-400 italic">Authentic Experience</span>
        </div>
      </div>

      <!-- Content Section -->
      <div :class="[isTeaser ? 'order-1' : 'text-center md:text-left']">
        <h2 
          v-if="showTitle" 
          :class="['font-bold mb-8', isTeaser ? 'text-3xl text-white' : 'text-5xl md:text-6xl text-gray-900 italic tracking-tighter leading-none']"
        >
          {{ title || 'Our Story' }}
        </h2>
        
        <div :class="['prose prose-lg max-w-none', isTeaser ? 'text-white/80' : 'text-gray-700 mx-auto']">
          <slot>
            <p :class="['leading-relaxed mb-8', isTeaser ? 'text-lg' : 'text-xl font-medium text-gray-800 leading-relaxed']">
              {{ description || 'Experience the essence of Japanese culinary tradition in the heart of Krabi.' }}
            </p>
          </slot>
          
          <div v-if="!isTeaser" class="mt-16 pt-12 border-t border-stone-100 text-center">
            <p class="font-bold italic text-3xl text-black tracking-tight">
              "Happy Guest, Happy Kikuzuki"
            </p>
          </div>
        </div>

        <div v-if="isTeaser" class="mt-10">
          <AppButton to="/about" :variant="bg === 'black' ? 'white' : 'primary'" size="md">
            Our Full Story
          </AppButton>
        </div>
      </div>
    </div>
  </AppSection>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import AppButton from '~/components/ui/AppButton.vue'

defineProps({
  title: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  image: {
    type: String,
    default: null
  },
  isTeaser: {
    type: Boolean,
    default: false
  },
  bg: {
    type: String,
    default: 'white'
  },
  padding: {
    type: String,
    default: 'lg'
  },
  showTitle: {
    type: Boolean,
    default: true
  }
})
</script>

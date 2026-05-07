<template>
  <div class="relative w-full bg-(--ui-bg-inverted) text-(--ui-text-inverted) overflow-hidden" :style="heroStyle">
    <!-- Background image slot -->
    <div v-if="image" class="absolute inset-0">
      <img :src="image" :alt="title" class="w-full h-full object-cover opacity-50" />
    </div>

    <!-- Background video slot -->
    <div v-if="video" class="absolute inset-0">
      <video
        :src="video"
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover opacity-50"
      />
    </div>

    <!-- Content -->
    <div class="relative z-10 max-w-6xl mx-auto px-4 flex flex-col items-center justify-center text-center h-full" :style="heroStyle">
      <!-- Establishment Year -->
      <div v-if="establishmentYear" class="inline-flex items-center gap-2 mb-6">
        <span class="w-8 h-px bg-(--ui-border) opacity-30"></span>
        <span class="text-[10px] font-bold uppercase tracking-[0.3em] text-(--ui-text-inverted) opacity-60 italic">
          EST. {{ establishmentYear }}
        </span>
        <span class="w-8 h-px bg-(--ui-border) opacity-30"></span>
      </div>

      <EditableField
        v-if="fieldKey"
        :field-key="`${fieldKey}-title`"
        tag="h1"
        :class="titleClass"
        :model-value="title"
        @update:model-value="$emit('update:title', $event)"
      />
      <h1 v-else :class="titleClass">{{ title }}</h1>

      <EditableField
        v-if="fieldKey && subtitle"
        :field-key="`${fieldKey}-subtitle`"
        tag="p"
        :class="subtitleClass"
        :model-value="subtitle"
        @update:model-value="$emit('update:subtitle', $event)"
      />
      <p v-else-if="subtitle" :class="subtitleClass">{{ subtitle }}</p>

      <div v-if="$slots.cta" class="mt-8">
        <slot name="cta" />
      </div>
    </div>
  </div>
</template>

<script setup>
import EditableField from '~/components/ui/EditableField.vue'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: null },
  image: { type: String, default: null },
  video: { type: String, default: null },
  height: { type: String, default: null },
  size: {
    type: String,
    default: 'page',
    validator: v => ['home', 'page', 'compact'].includes(v)
  },
  fieldKey: { type: String, default: null },
  establishmentYear: { type: String, default: null }
})

defineEmits(['update:title', 'update:subtitle'])

const heights = {
  home: '100vh',
  page: '40vh',
  compact: '24vh'
}

const heroStyle = computed(() => ({ minHeight: props.height ?? heights[props.size] }))

const titleClass = computed(() => [
  'font-black italic tracking-tighter uppercase leading-[0.9]',
  props.size === 'home' || props.height === '100vh'
    ? 'text-5xl md:text-8xl mb-6'
    : 'text-3xl md:text-5xl mb-4'
])

const subtitleClass = computed(() => [
  'opacity-80 max-w-2xl font-light',
  props.size === 'home' || props.height === '100vh'
    ? 'text-lg md:text-2xl'
    : 'text-base md:text-lg'
])
</script>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 1s ease-out;
}
</style>

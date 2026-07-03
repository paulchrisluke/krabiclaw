<template>
  <div class="booking-guest-counter flex items-center justify-between py-4">
    <div>
      <h3 class="font-semibold text-default text-lg">{{ label }}</h3>
      <p v-if="sublabel" class="text-sm text-muted mt-0.5">{{ sublabel }}</p>
    </div>
    
    <div class="flex items-center gap-4">
      <button 
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-full border border-default text-default disabled:opacity-30 disabled:cursor-not-allowed hover:border-black hover:dark:border-white transition-colors"
        :disabled="modelValue <= min"
        @click="decrement"
        :aria-label="`Decrease ${label}`"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" /></svg>
      </button>
      
      <span class="w-4 text-center font-medium text-default">{{ modelValue }}</span>
      
      <button 
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-full border border-default text-default disabled:opacity-30 disabled:cursor-not-allowed hover:border-black hover:dark:border-white transition-colors"
        :disabled="max !== undefined && modelValue >= max"
        @click="increment"
        :aria-label="`Increase ${label}`"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: number
  label?: string
  sublabel?: string
  min?: number
  max?: number
}>(), {
  label: 'Guests',
  min: 1
})

const emit = defineEmits<{
  'update:modelValue': [val: number]
}>()

function increment() {
  if (props.max !== undefined && props.modelValue >= props.max) return
  emit('update:modelValue', props.modelValue + 1)
}

function decrement() {
  if (props.modelValue <= props.min) return
  emit('update:modelValue', props.modelValue - 1)
}
</script>

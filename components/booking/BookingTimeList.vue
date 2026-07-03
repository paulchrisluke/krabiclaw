<template>
  <div class="booking-time-list space-y-3">
    <button
      v-for="slot in slots"
      :key="slot.id"
      type="button"
      class="w-full flex items-center justify-between p-4 rounded-xl border border-default text-left transition-all"
      :class="[
        slot.spotsLeft === 0 
          ? 'opacity-50 cursor-not-allowed bg-muted/5' 
          : 'hover:border-black hover:dark:border-white hover:shadow-sm cursor-pointer',
        modelValue === slot.id 
          ? 'border-black dark:border-white ring-1 ring-black dark:ring-white bg-muted/5' 
          : ''
      ]"
      :disabled="slot.spotsLeft === 0"
      @click="selectSlot(slot.id)"
    >
      <div>
        <div class="font-semibold text-default text-[15px]">
          {{ formatTimeSlot(slot.startTime, slot.durationMinutes) }}
        </div>
        <div v-if="slot.priceStr" class="text-sm text-muted mt-0.5">
          {{ slot.priceStr }}
        </div>
      </div>
      
      <div class="text-right">
        <span 
          v-if="slot.spotsLeft === 0"
          class="text-sm font-medium text-muted"
        >
          Sold out
        </span>
        <span 
          v-else-if="slot.spotsLeft !== undefined && slot.spotsLeft <= 3"
          class="text-sm font-medium text-red-500"
        >
          {{ slot.spotsLeft }} {{ slot.spotsLeft === 1 ? 'spot' : 'spots' }} left
        </span>
        <span 
          v-else-if="slot.spotsLeft !== undefined"
          class="text-sm font-medium text-muted"
        >
          {{ slot.spotsLeft }} spots available
        </span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { formatTimeSlot } from '@/utils/time-format'

export interface TimeSlot {
  id: string
  startTime: string // "14:00"
  durationMinutes?: number | null
  priceStr?: string // "$50 / guest"
  spotsLeft?: number
}

defineProps<{
  modelValue?: string | null // slot.id
  slots: TimeSlot[]
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

function selectSlot(id: string) {
  emit('update:modelValue', id)
}
</script>

<template>
  <div class="booking-date-selector">
    <div class="flex items-center justify-between mb-4">
      <button 
        type="button" 
        class="p-2 -ml-2 rounded-full hover:bg-muted/10 text-default disabled:opacity-50"
        :disabled="isPrevDisabled"
        @click="prevMonth"
      >
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      <h3 class="font-semibold text-lg text-default">
        {{ currentMonthName }} {{ currentYear }}
      </h3>
      <button 
        type="button" 
        class="p-2 -mr-2 rounded-full hover:bg-muted/10 text-default"
        @click="nextMonth"
      >
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 mb-2">
      <div v-for="day in weekDays" :key="day" class="text-center text-xs font-semibold text-muted py-1">
        {{ day }}
      </div>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <!-- Empty slots for days before start of month -->
      <div v-for="empty in emptyDays" :key="'empty-' + empty" class="aspect-square"></div>
      
      <!-- Days of month -->
      <button
        v-for="dateObj in calendarDays"
        :key="dateObj.date.toISOString()"
        type="button"
        class="aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-all"
        :class="[
          dateObj.isDisabled 
            ? 'text-muted/40 cursor-not-allowed' 
            : 'text-default hover:border-black hover:dark:border-white hover:border cursor-pointer',
          isSelected(dateObj.date) 
            ? 'bg-black text-white dark:bg-white dark:text-black hover:border-transparent' 
            : '',
          isToday(dateObj.date) && !isSelected(dateObj.date)
            ? 'font-bold underline decoration-2 underline-offset-4'
            : ''
        ]"
        :disabled="dateObj.isDisabled"
        @click="selectDate(dateObj.date)"
      >
        {{ dateObj.date.getDate() }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue?: Date | null
  availableDates?: string[] // YYYY-MM-DD
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', date: Date): void
}>()

// Current viewing month/year
const viewDate = ref(props.modelValue ? new Date(props.modelValue) : new Date())

const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const currentMonthName = computed(() => {
  return viewDate.value.toLocaleString('default', { month: 'long' })
})
const currentYear = computed(() => viewDate.value.getFullYear())

const emptyDays = computed(() => {
  const firstDay = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth(), 1)
  return firstDay.getDay()
})

const daysInMonth = computed(() => {
  return new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 0).getDate()
})

const today = new Date()
today.setHours(0, 0, 0, 0)

const isPrevDisabled = computed(() => {
  return viewDate.value.getFullYear() === today.getFullYear() && viewDate.value.getMonth() <= today.getMonth()
})

const calendarDays = computed(() => {
  const days = []
  for (let i = 1; i <= daysInMonth.value; i++) {
    const d = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth(), i)
    
    let disabled = false
    
    // Disable past dates
    if (d < today) {
      disabled = true
    } 
    // If availableDates array provided, disable if not in it
    else if (props.availableDates) {
      const dateStr = d.toISOString().split('T')[0] ?? ''
      if (!dateStr || !props.availableDates.includes(dateStr)) {
        disabled = true
      }
    }

    days.push({
      date: d,
      isDisabled: disabled
    })
  }
  return days
})

function prevMonth() {
  if (isPrevDisabled.value) return
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1)
}

function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1)
}

function selectDate(d: Date) {
  emit('update:modelValue', d)
}

function isSelected(d: Date) {
  if (!props.modelValue) return false
  return (
    d.getDate() === props.modelValue.getDate() &&
    d.getMonth() === props.modelValue.getMonth() &&
    d.getFullYear() === props.modelValue.getFullYear()
  )
}

function isToday(d: Date) {
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  )
}
</script>

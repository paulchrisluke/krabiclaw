<template>
  <div class="booking-location-step">
    <div
      class="grid gap-3"
      :class="locations.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'"
    >
      <button
        v-for="loc in locations"
        :key="loc.id"
        type="button"
        class="group relative flex flex-col text-left rounded-xl border transition-all overflow-hidden"
        :class="[
          modelValue === loc.id
            ? 'border-black dark:border-white ring-1 ring-black dark:ring-white'
            : 'border-default hover:border-black/40 dark:hover:border-white/40'
        ]"
        @click="$emit('update:modelValue', loc.id)"
      >
        <!-- Location image if available -->
        <div v-if="loc.image_url" class="aspect-[16/7] w-full overflow-hidden bg-muted shrink-0">
          <img
            :src="loc.image_url ?? ''"
            :alt="loc.title ?? ''"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        <div class="p-4 flex flex-col gap-1.5">
          <!-- Selected indicator -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold text-default text-[15px] leading-snug">{{ loc.title }}</h3>
            <div
              class="shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
              :class="modelValue === loc.id
                ? 'border-black dark:border-white bg-black dark:bg-white'
                : 'border-default'"
            >
              <svg
                v-if="modelValue === loc.id"
                class="w-2.5 h-2.5 text-white dark:text-black"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 6l3 3 5-5" />
              </svg>
            </div>
          </div>

          <!-- Address -->
          <p v-if="loc.address" class="text-sm text-muted leading-snug">
            {{ formatAddress(loc.address) }}
          </p>

          <!-- Today's hours -->
          <p v-if="todayHours(loc)" class="text-sm text-muted">
            <span class="text-default font-medium">Today: </span>{{ todayHours(loc) }}
          </p>

          <!-- Phone -->
          <p v-if="loc.phone" class="text-sm text-muted">{{ loc.phone }}</p>
        </div>
      </button>
    </div>

    <!-- Continue button -->
    <div class="pt-6">
      <button
        type="button"
        class="w-full py-3 px-4 rounded-xl text-white bg-black dark:bg-white dark:text-black font-semibold text-[15px] shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="!modelValue"
        @click="$emit('next')"
      >
        Continue
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isStructuredOpeningHours } from '@/shared/reservation-hours'

export interface BookingLocation {
  id: string
  title?: string | null
  address?: unknown
  phone?: string | null
  image_url?: string | null
  opening_hours?: unknown
}

defineProps<{
  modelValue?: string | null
  locations: BookingLocation[]
}>()

defineEmits<{
  'update:modelValue': [id: string]
  next: []
}>()

function formatAddress(address: unknown): string {
  if (!address) return ''
  if (typeof address === 'string') return address
  type Addr = { addressLines?: string[]; locality?: string; administrativeArea?: string }
  const addr = address as Addr
  return [...(addr.addressLines ?? []), addr.locality, addr.administrativeArea]
    .filter(Boolean)
    .join(', ')
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

function todayHours(loc: BookingLocation): string | null {
  const hours = loc.opening_hours
  if (!isStructuredOpeningHours(hours)) return null
  const today = WEEKDAYS[new Date().getDay()]
  const todaysEntry = hours.find(e => e.openDay.toUpperCase() === today)
  if (!todaysEntry) return 'Closed today'
  return `${fmt12(todaysEntry.openTime)} – ${fmt12(todaysEntry.closeTime)}`
}

function fmt12(timeStr: string): string {
  const parts = timeStr.split(':')
  const h = parseInt(parts[0] ?? '0', 10)
  const m = parseInt(parts[1] ?? '0', 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
</script>

<template>
  <div class="booking-location-step">
    <div
      class="grid gap-3"
      :class="locations.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
    >
      <button
        v-for="loc in locations"
        :key="loc.id"
        type="button"
        class="group relative flex flex-col text-left rounded-xl border transition-all overflow-hidden"
        :class="[
          modelValue === loc.id
            ? 'border-primary ring-1 ring-primary'
            : 'border-default hover:border-primary/40'
        ]"
        @click="$emit('update:modelValue', loc.id)"
      >
        <!-- Location image if available -->
        <div v-if="loc.public_url" class="aspect-16/7 w-full overflow-hidden bg-muted shrink-0">
          <img
            v-if="loc.kind === 'image'"
            :src="loc.public_url ?? ''"
            :alt="loc.title ?? ''"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div
            v-else-if="loc.kind === 'video'"
            class="h-full w-full flex items-center justify-center bg-muted"
          >
            <svg viewBox="0 0 24 24" class="w-12 h-12 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>

        <div class="p-4 flex flex-col gap-1.5">
          <!-- Selected indicator -->
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold text-default text-[15px] leading-snug">{{ loc.title }}</h3>
            <div
              class="shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
              :class="modelValue === loc.id
                ? 'border-primary bg-primary'
                : 'border-default'"
            >
              <svg
                v-if="modelValue === loc.id"
                class="w-2.5 h-2.5 text-(--brand-color-foreground)"
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
          <p v-if="getTodayHoursLabel(loc.opening_hours, 'Closed')" class="text-sm text-muted">
            <span class="text-default font-medium">Today: </span>{{ getTodayHoursLabel(loc.opening_hours, 'Closed') }}
          </p>

          <!-- Phone -->
          <p v-if="loc.phone" class="text-sm text-muted">{{ loc.phone }}</p>
        </div>
      </button>
    </div>

    <!-- Continue button -->
    <div class="pt-6">
      <SayaButton size="lg" block :disabled="!modelValue" @click="$emit('next')">
        Continue
      </SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getTodayHoursLabel } from '@/shared/reservation-hours'

export interface BookingLocation {
  id: string
  title?: string | null
  address?: unknown
  phone?: string | null
  public_url?: string | null
  kind?: 'image' | 'video' | null
  thumbnail_url?: string | null
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

</script>

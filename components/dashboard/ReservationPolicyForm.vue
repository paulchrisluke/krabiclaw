<template>
  <div class="space-y-4">
    <!--
      Every one of these renders as a sentence on the public page
      (server/utils/booking-policy-summary.ts), switched on by having a value.
      So the tenant picks the sentence their guests will read, and the number
      inside it — not a field called "deposit_trigger_party_size".
    -->
    <div
      v-for="rule in rules"
      :key="rule.id"
      class="rounded-xl border border-default px-4 py-3"
    >
      <div class="flex items-start gap-3">
        <UCheckbox
          :model-value="rule.on"
          :aria-label="rule.aria"
          class="mt-0.5"
          @update:model-value="rule.toggle(Boolean($event))"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm" :class="rule.on ? 'text-highlighted' : 'text-muted'">{{ rule.sentence }}</p>
          <div v-if="rule.on && rule.numeric" class="mt-2">
            <UInputNumber
              :model-value="rule.value"
              :min="rule.min"
              class="w-32"
              :aria-label="rule.aria"
              @update:model-value="rule.set($event as number | null)"
            />
          </div>
        </div>
      </div>
    </div>

    <UFormField label="Anything else" help="Shown at the end of the list on your public page.">
      <UTextarea
        :model-value="value.additional_notes_html ?? ''"
        :rows="3"
        class="w-full"
        @update:model-value="updateNotes($event)"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { LocationReservationConfigPatch } from '~/server/utils/reservations'

const props = defineProps<{
  modelValue: LocationReservationConfigPatch
}>()

const emit = defineEmits<{
  'update:modelValue': [value: LocationReservationConfigPatch]
}>()

const value = computed(() => props.modelValue)

function patch(next: LocationReservationConfigPatch) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

function updateNotes(next: string | number) {
  const normalized = typeof next === 'string' ? next.trim() : ''
  patch({ additional_notes_html: normalized || null })
}

/** Each rule owns the sentence it produces, so the two cannot drift apart. */
interface PolicyRule {
  id: string
  aria: string
  on: boolean
  sentence: string
  value?: number
  numeric?: boolean
  min?: number
  toggle: (on: boolean) => void
  set: (next: number | null) => void
}

// Minutes the guest reads as a sentence; the editor states them in hours where
// the underlying field is a cutoff, so nobody types 1440.
const rules = computed<PolicyRule[]>(() => [
  {
    id: 'slot_capacity',
    aria: 'Guests per time slot',
    on: value.value.slot_capacity !== null && value.value.slot_capacity !== undefined,
    value: value.value.slot_capacity ?? 20,
    numeric: true,
    min: 1,
    sentence: value.value.slot_capacity === null || value.value.slot_capacity === undefined
      ? 'Every time slot takes as many guests as ask for it.'
      : `Each time slot takes ${value.value.slot_capacity} guests.`,
    toggle: (on: boolean) => patch({ slot_capacity: on ? (value.value.slot_capacity ?? 20) : null }),
    set: (next: number | null) => patch({ slot_capacity: next }),
  },
  {
    id: 'advance_notice',
    aria: 'Hours of advance notice',
    on: Boolean(value.value.advance_notice_minutes),
    value: (value.value.advance_notice_minutes ?? 120) / 60,
    numeric: true,
    min: 1,
    sentence: `Guests book at least ${(value.value.advance_notice_minutes ?? 120) / 60} hours ahead.`,
    toggle: (on: boolean) => patch({ advance_notice_minutes: on ? (value.value.advance_notice_minutes ?? 120) : null }),
    set: (next: number | null) => patch({ advance_notice_minutes: next === null ? null : next * 60 }),
  },
  {
    id: 'cancellation',
    aria: 'Hours of free cancellation',
    on: Boolean(value.value.free_cancellation_until_minutes),
    value: (value.value.free_cancellation_until_minutes ?? 24 * 60) / 60,
    numeric: true,
    min: 1,
    sentence: `Change or cancel free up to ${(value.value.free_cancellation_until_minutes ?? 24 * 60) / 60} hours before the booking.`,
    toggle: (on: boolean) => patch({ free_cancellation_until_minutes: on ? (value.value.free_cancellation_until_minutes ?? 24 * 60) : null }),
    set: (next: number | null) => patch({ free_cancellation_until_minutes: next === null ? null : next * 60 }),
  },
  {
    id: 'reschedule',
    aria: 'Hours before the start time a guest can reschedule',
    on: Boolean(value.value.reschedule_allowed && value.value.reschedule_cutoff_minutes),
    value: (value.value.reschedule_cutoff_minutes ?? 4 * 60) / 60,
    numeric: true,
    min: 1,
    sentence: `Guests can reschedule up to ${(value.value.reschedule_cutoff_minutes ?? 4 * 60) / 60} hours before the start time.`,
    toggle: (on: boolean) => patch({
      reschedule_allowed: on,
      reschedule_cutoff_minutes: on ? (value.value.reschedule_cutoff_minutes ?? 4 * 60) : null,
    }),
    set: (next: number | null) => patch({ reschedule_cutoff_minutes: next === null ? null : next * 60 }),
  },
  {
    id: 'deposit',
    aria: 'Party size that needs a deposit',
    on: Boolean(value.value.deposit_required),
    value: value.value.deposit_trigger_party_size ?? 6,
    numeric: true,
    min: 1,
    sentence: value.value.deposit_trigger_party_size
      ? `Parties of ${value.value.deposit_trigger_party_size}+ guests may require a deposit.`
      : 'A deposit may be required before confirmation.',
    toggle: (on: boolean) => patch({
      deposit_required: on,
      deposit_trigger_party_size: on ? (value.value.deposit_trigger_party_size ?? 6) : null,
    }),
    set: (next: number | null) => patch({ deposit_trigger_party_size: next }),
  },
  {
    id: 'minimum_guest_age',
    aria: 'Minimum guest age',
    on: Boolean(value.value.minimum_guest_age),
    value: value.value.minimum_guest_age ?? 18,
    numeric: true,
    min: 1,
    sentence: `The minimum guest age is ${value.value.minimum_guest_age ?? 18}.`,
    toggle: (on: boolean) => patch({ minimum_guest_age: on ? 18 : null }),
    set: (next: number | null) => patch({ minimum_guest_age: next }),
  },
  {
    id: 'accessibility',
    aria: 'Ask guests to get in touch about accessibility',
    on: Boolean(value.value.accessibility_contact_required),
    sentence: 'Please contact us before booking if you need accessibility arrangements.',
    toggle: (on: boolean) => patch({ accessibility_contact_required: on }),
    set: () => {},
  },
])
</script>

<template>
  <div>
    <!--
      Every one of these renders as a sentence on the public page
      (server/utils/booking-policy-summary.ts), switched on by having a value.
      So each rule is the sentence guests will read, answered ✕ or ✓. A number with a picker of its own — seats, notice,
      cancellation — is chosen there, not typed again here.
    -->
    <RuleRow
      v-for="rule in rules"
      :key="rule.id"
      :model-value="rule.on"
      :label="rule.sentence"
      @update:model-value="rule.toggle"
    >
      <template v-if="rule.on && rule.picker" #description>
        <NuxtLink :to="rule.picker" class="font-medium text-highlighted underline underline-offset-4">Change</NuxtLink>
      </template>
      <UInputNumber
        v-if="rule.on && rule.number"
        :model-value="rule.number.value"
        :min="1"
        :aria-label="rule.number.label"
        class="w-36"
        @update:model-value="rule.number.set($event as number | null)"
      />
    </RuleRow>

    <UFormField label="Anything else" class="pt-6">
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
import RuleRow from '~/components/dashboard/RuleRow.vue'
import type { LocationReservationConfigPatch } from '~/server/utils/reservations'

const props = defineProps<{
  modelValue: LocationReservationConfigPatch
  /** The calendar settings leaves that choose this location's seats, notice and cancellation policy. */
  pickers: { seats: string; notice: string; cancellation: string }
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
  on: boolean
  sentence: string
  /** The leaf that chooses this rule's number. */
  picker?: string
  /** A number with no picker of its own, typed under the rule. */
  number?: { label: string; value: number; set: (next: number | null) => void }
  toggle: (on: boolean) => void
}

// Minutes the guest reads as a sentence, in hours where the field is a cutoff.
const rules = computed<PolicyRule[]>(() => [
  {
    id: 'slot_capacity',
    on: value.value.slot_capacity !== null && value.value.slot_capacity !== undefined,
    sentence: value.value.slot_capacity === null || value.value.slot_capacity === undefined
      ? 'Every time slot takes as many guests as ask for it.'
      : `Each time slot takes ${value.value.slot_capacity} guests.`,
    picker: props.pickers.seats,
    toggle: (on: boolean) => patch({ slot_capacity: on ? (value.value.slot_capacity ?? 20) : null }),
  },
  {
    id: 'advance_notice',
    on: Boolean(value.value.advance_notice_minutes),
    sentence: `Guests book at least ${(value.value.advance_notice_minutes ?? 120) / 60} hours ahead.`,
    picker: props.pickers.notice,
    toggle: (on: boolean) => patch({ advance_notice_minutes: on ? (value.value.advance_notice_minutes ?? 120) : null }),
  },
  {
    id: 'cancellation',
    on: Boolean(value.value.free_cancellation_until_minutes),
    sentence: `Change or cancel free up to ${(value.value.free_cancellation_until_minutes ?? 24 * 60) / 60} hours before the booking.`,
    picker: props.pickers.cancellation,
    toggle: (on: boolean) => patch({ free_cancellation_until_minutes: on ? (value.value.free_cancellation_until_minutes ?? 24 * 60) : null }),
  },
  {
    id: 'reschedule',
    on: Boolean(value.value.reschedule_allowed && value.value.reschedule_cutoff_minutes),
    sentence: `Guests can reschedule up to ${(value.value.reschedule_cutoff_minutes ?? 4 * 60) / 60} hours before the start time.`,
    picker: props.pickers.cancellation,
    toggle: (on: boolean) => patch({
      reschedule_allowed: on,
      reschedule_cutoff_minutes: on ? (value.value.reschedule_cutoff_minutes ?? 4 * 60) : null,
    }),
  },
  {
    id: 'deposit',
    on: Boolean(value.value.deposit_required),
    sentence: value.value.deposit_trigger_party_size
      ? `Parties of ${value.value.deposit_trigger_party_size}+ guests may require a deposit.`
      : 'A deposit may be required before confirmation.',
    number: {
      label: 'Party size that needs a deposit',
      value: value.value.deposit_trigger_party_size ?? 6,
      set: (next: number | null) => patch({ deposit_trigger_party_size: next }),
    },
    toggle: (on: boolean) => patch({
      deposit_required: on,
      deposit_trigger_party_size: on ? (value.value.deposit_trigger_party_size ?? 6) : null,
    }),
  },
  {
    id: 'minimum_guest_age',
    on: Boolean(value.value.minimum_guest_age),
    sentence: `The minimum guest age is ${value.value.minimum_guest_age ?? 18}.`,
    number: {
      label: 'Minimum guest age',
      value: value.value.minimum_guest_age ?? 18,
      set: (next: number | null) => patch({ minimum_guest_age: next }),
    },
    toggle: (on: boolean) => patch({ minimum_guest_age: on ? 18 : null }),
  },
  {
    id: 'accessibility',
    on: Boolean(value.value.accessibility_contact_required),
    sentence: 'Please contact us before booking if you need accessibility arrangements.',
    toggle: (on: boolean) => patch({ accessibility_contact_required: on }),
  },
])
</script>

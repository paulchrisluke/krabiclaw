<template>
  <div class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Confirmation SLA (minutes)">
        <UInput :model-value="numberInputValue(value.host_confirmation_sla_minutes)" type="number" min="0" @update:model-value="updateNumber('host_confirmation_sla_minutes', $event)" />
      </UFormField>
      <UFormField label="Free cancellation cutoff (minutes)">
        <UInput :model-value="numberInputValue(value.free_cancellation_until_minutes)" type="number" min="0" @update:model-value="updateNumber('free_cancellation_until_minutes', $event)" />
      </UFormField>
      <UFormField label="Advance notice (minutes)">
        <UInput :model-value="numberInputValue(value.advance_notice_minutes)" type="number" min="0" @update:model-value="updateNumber('advance_notice_minutes', $event)" />
      </UFormField>
      <UFormField label="Late arrival grace (minutes)">
        <UInput :model-value="numberInputValue(value.late_arrival_grace_minutes)" type="number" min="0" @update:model-value="updateNumber('late_arrival_grace_minutes', $event)" />
      </UFormField>
      <UFormField label="Deposit trigger party size">
        <UInput :model-value="numberInputValue(value.deposit_trigger_party_size)" type="number" min="0" @update:model-value="updateNumber('deposit_trigger_party_size', $event)" />
      </UFormField>
      <UFormField label="Minimum guest age" v-if="policyType === 'experience'">
        <UInput :model-value="numberInputValue(value.minimum_guest_age)" type="number" min="0" @update:model-value="updateNumber('minimum_guest_age', $event)" />
      </UFormField>
    </div>

    <div class="space-y-3">
      <UCheckbox :model-value="Boolean(value.reschedule_allowed)" label="Allow rescheduling" @update:model-value="updateBoolean('reschedule_allowed', $event)" />
      <UFormField v-if="value.reschedule_allowed" label="Reschedule cutoff (minutes)">
        <UInput :model-value="numberInputValue(value.reschedule_cutoff_minutes)" type="number" min="0" @update:model-value="updateNumber('reschedule_cutoff_minutes', $event)" />
      </UFormField>
      <UCheckbox :model-value="Boolean(value.deposit_required)" label="Deposit may be required" @update:model-value="updateBoolean('deposit_required', $event)" />
      <UCheckbox :model-value="Boolean(value.special_requests_allowed)" label="Allow special requests" @update:model-value="updateBoolean('special_requests_allowed', $event)" />
      <UCheckbox
        v-if="policyType === 'experience'"
        :model-value="Boolean(value.accessibility_contact_required)"
        label="Require contact for accessibility arrangements"
        @update:model-value="updateBoolean('accessibility_contact_required', $event)"
      />
    </div>

    <UFormField v-if="policyType === 'experience'" label="Weather policy">
      <UTextarea :model-value="value.weather_policy ?? ''" :rows="3" autoresize @update:model-value="updateString('weather_policy', $event)" />
    </UFormField>

    <UFormField label="Additional notes">
      <UTextarea
        :model-value="value.additional_notes_html ?? ''"
        :rows="4"
        autoresize
        placeholder="Optional extra notes that appear after the generated policy summary."
        @update:model-value="updateString('additional_notes_html', $event)"
      />
    </UFormField>

    <div v-if="summary" class="rounded-lg border border-default bg-muted p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{{ summary.heading }}</p>
      <ol class="mt-3 space-y-3">
        <li v-for="(item, index) in summary.items" :key="item.id" class="flex gap-3 text-sm text-default">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-default bg-default text-xs">{{ index + 1 }}</span>
          <span>{{ item.text }}</span>
        </li>
      </ol>
      <div v-if="summary.additional_notes_html" class="mt-4 border-t border-default pt-4 text-sm text-muted">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="summary.additional_notes_html" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BookingPolicyPatch, RenderedBookingPolicySummary } from '~/server/utils/booking-policies'

const props = defineProps<{
  modelValue: BookingPolicyPatch
  policyType: 'reservation' | 'experience'
  summary?: RenderedBookingPolicySummary | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BookingPolicyPatch]
}>()

const value = computed(() => props.modelValue)

function patch(next: Partial<BookingPolicyPatch>) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

function normalizeNumber(value: string | number | null | undefined) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null
}

function numberInputValue(value: number | null | undefined) {
  return value == null ? undefined : String(value)
}

function updateNumber(field: keyof BookingPolicyPatch, next: string | number | null | undefined) {
  patch({ [field]: normalizeNumber(next) })
}

function updateBoolean(field: keyof BookingPolicyPatch, next: boolean | 'indeterminate') {
  patch({ [field]: next === true })
}

function updateString(field: keyof BookingPolicyPatch, next: string | number | null | undefined) {
  const normalized = typeof next === 'string' ? next.trim() : ''
  patch({ [field]: normalized || null })
}
</script>

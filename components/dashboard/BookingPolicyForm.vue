<template>
  <div class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Free cancellation cutoff (minutes)">
        <UInputNumber :model-value="value.free_cancellation_until_minutes" :min="0" class="w-full" @update:model-value="updateNumber('free_cancellation_until_minutes', $event)" />
      </UFormField>
      <UFormField label="Advance notice (minutes)">
        <UInputNumber :model-value="value.advance_notice_minutes" :min="0" class="w-full" @update:model-value="updateNumber('advance_notice_minutes', $event)" />
      </UFormField>
      <UFormField label="Deposit trigger party size">
        <UInputNumber :model-value="value.deposit_trigger_party_size" :min="0" class="w-full" @update:model-value="updateNumber('deposit_trigger_party_size', $event)" />
      </UFormField>
      <UFormField label="Minimum guest age" v-if="policyType === 'experience'">
        <UInputNumber :model-value="value.minimum_guest_age" :min="0" class="w-full" @update:model-value="updateNumber('minimum_guest_age', $event)" />
      </UFormField>
    </div>

    <div class="space-y-3">
      <UCheckbox :model-value="Boolean(value.reschedule_allowed)" label="Allow rescheduling" @update:model-value="updateBoolean('reschedule_allowed', $event)" />
      <UFormField v-if="value.reschedule_allowed" label="Reschedule cutoff (minutes)">
        <UInputNumber :model-value="value.reschedule_cutoff_minutes" :min="0" class="w-full" @update:model-value="updateNumber('reschedule_cutoff_minutes', $event)" />
      </UFormField>
      <UCheckbox :model-value="Boolean(value.deposit_required)" label="Deposit may be required" @update:model-value="updateBoolean('deposit_required', $event)" />
      <UCheckbox
        v-if="policyType === 'experience'"
        :model-value="Boolean(value.accessibility_contact_required)"
        label="Require contact for accessibility arrangements"
        @update:model-value="updateBoolean('accessibility_contact_required', $event)"
      />
    </div>

    <div v-if="summary" class="rounded-lg border border-default bg-muted p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{{ summary.heading }}</p>
      <ol class="mt-3 space-y-3">
        <li v-for="(item, index) in summary.items" :key="item.id" class="flex gap-3 text-sm text-default">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-default bg-default text-xs">{{ index + 1 }}</span>
          <span>{{ item.text }}</span>
        </li>
      </ol>
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

function updateNumber(field: keyof BookingPolicyPatch, next: number | null | undefined) {
  if (next == null || (next as unknown) === '') {
    patch({ [field]: null })
  } else if (Number.isFinite(next)) {
    patch({ [field]: Math.max(0, Math.trunc(next)) })
  }
}

function updateBoolean(field: keyof BookingPolicyPatch, next: boolean | 'indeterminate') {
  patch({ [field]: next === true })
}

</script>

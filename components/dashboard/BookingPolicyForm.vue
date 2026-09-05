<template>
  <div class="space-y-4">
    <!--
      Every one of these renders as a sentence on the public page
      (server/utils/booking-policy-summary.ts), switched on by having a value.
      So the tenant picks the sentence their guests will read, and the number
      inside it — not a field called "deposit_trigger_party_size".
    -->
    <div
      v-for="rule in visibleRules"
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
          <div v-if="rule.on && rule.choices" class="mt-2">
            <USelect
              :model-value="rule.value"
              :items="rule.choices"
              class="w-48"
              :aria-label="rule.aria"
              @update:model-value="rule.set(Number($event))"
            />
          </div>
          <div v-else-if="rule.on && rule.numeric" class="mt-2">
            <UInputNumber
              :model-value="rule.value"
              :min="rule.min ?? 1"
              class="w-32"
              :aria-label="rule.aria"
              @update:model-value="rule.set($event as number | null)"
            />
          </div>
        </div>
      </div>
    </div>

    <UFormField v-if="shows('notes')" label="Anything else" help="Shown at the end of the list on your public page.">
      <UTextarea
        :model-value="value.additional_notes_html ?? ''"
        :rows="3"
        class="w-full"
        @update:model-value="updateString('additional_notes_html', $event)"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { BookingPolicyPatch, RenderedBookingPolicySummary } from '~/server/utils/booking-policies'

const props = defineProps<{
  modelValue: BookingPolicyPatch
  policyType: 'reservation' | 'experience'
  summary?: RenderedBookingPolicySummary | null
  /**
   * Which notes this surface owns. The policy is one row, but its sentences
   * belong to different parts of the editor — a deposit is a pricing fact, a
   * minimum age is a guest fact — so each leaf renders its own subset and the
   * wording still lives in one place.
   */
  only?: readonly string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BookingPolicyPatch]
}>()

const value = computed(() => props.modelValue)

function patch(next: Partial<BookingPolicyPatch>) {
  emit('update:modelValue', { ...props.modelValue, ...next })
}

function updateString(field: keyof BookingPolicyPatch, next: string | number | null | undefined) {
  const normalized = typeof next === 'string' ? next.trim() : ''
  patch({ [field]: normalized || null })
}


/** Each rule owns the sentence it produces, so the two cannot drift apart. */
interface PolicyRule {
  id: string
  aria: string
  on: boolean
  sentence: string
  value?: number
  choices?: Array<{ label: string; value: number }>
  numeric?: boolean
  min?: number
  toggle: (on: boolean) => void
  set: (next: number | null) => void
}

const rules = computed(() => {
  const list: PolicyRule[] = [
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
      toggle: (on: boolean) => patch({ deposit_required: on, deposit_trigger_party_size: on ? (value.value.deposit_trigger_party_size ?? 6) : null }),
      set: (next: number | null) => patch({ deposit_trigger_party_size: next }),
    },
  ]

  if (props.policyType === 'experience') {
    list.push({
      id: 'minimum_guest_age',
      aria: 'Minimum guest age',
      on: Boolean(value.value.minimum_guest_age),
      value: value.value.minimum_guest_age ?? 18,
      numeric: true,
      min: 1,
      sentence: `The minimum guest age is ${value.value.minimum_guest_age ?? 18}.`,
      toggle: (on: boolean) => patch({ minimum_guest_age: on ? 18 : null }),
      set: (next: number | null) => patch({ minimum_guest_age: next }),
    })
    list.push({
      id: 'accessibility',
      aria: 'Ask guests to get in touch about accessibility',
      on: Boolean(value.value.accessibility_contact_required),
      sentence: 'Please contact us before booking if you need accessibility arrangements.',
      toggle: (on: boolean) => patch({ accessibility_contact_required: on }),
      set: () => {},
    })
  }

  return list
})

function shows(id: string) {
  return !props.only || props.only.includes(id)
}

const visibleRules = computed(() => rules.value.filter(rule => shows(rule.id)))
</script>

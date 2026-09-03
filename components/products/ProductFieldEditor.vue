<template>
  <div class="space-y-4">
    <UInput
      v-if="draft.kind === 'name' || draft.kind === 'category' || draft.kind === 'price' || draft.kind === 'order-url' || draft.kind === 'tags'"
      :model-value="draft.value"
      :type="draft.kind === 'order-url' ? 'url' : 'text'"
      :inputmode="draft.kind === 'price' ? 'decimal' : undefined"
      :maxlength="draft.kind === 'name' ? 240 : draft.kind === 'category' ? 120 : undefined"
      size="xl"
      :aria-label="label"
      :disabled="disabled"
      class="w-full"
      @update:model-value="value => updateText(String(value ?? ''))"
    />
    <UTextarea
      v-else-if="draft.kind === 'description' || draft.kind === 'details'"
      :model-value="draft.value"
      :rows="draft.kind === 'details' ? 12 : 8"
      :maxlength="draft.kind === 'description' ? 10000 : undefined"
      autoresize
      :aria-label="label"
      :disabled="disabled"
      class="w-full"
      :class="draft.kind === 'details' ? 'font-mono text-sm' : ''"
      @update:model-value="value => updateText(String(value ?? ''))"
    />
    <fieldset v-else-if="statusDraft" class="space-y-4" :disabled="disabled">
      <legend class="sr-only">Availability and visibility</legend>
      <UCheckbox :model-value="statusDraft.available" label="Available" @update:model-value="value => updateStatus('available', Boolean(value))" />
      <UCheckbox :model-value="statusDraft.isVisible" label="Visible" @update:model-value="value => updateStatus('isVisible', Boolean(value))" />
      <UCheckbox :model-value="statusDraft.featured" label="Featured" @update:model-value="value => updateStatus('featured', Boolean(value))" />
    </fieldset>
    <UAlert v-if="validationError" color="error" variant="soft" title="Check this field" :description="validationError" />
  </div>
</template>

<script setup lang="ts">
import type { CurrencyCode } from '~/shared/currencies'

export type ProductFieldId = 'name' | 'category' | 'price' | 'description' | 'order-url' | 'tags' | 'details' | 'status'
export type ProductFieldDraft =
  | { kind: 'name' | 'category' | 'description' | 'order-url' | 'tags' | 'details', value: string }
  | { kind: 'price', value: string, currency: CurrencyCode }
  | { kind: 'status', available: boolean, isVisible: boolean, featured: boolean }

const props = defineProps<{
  draft: ProductFieldDraft
  label: string
  disabled?: boolean
  validationError?: string | null
}>()

const emit = defineEmits<{ update: [draft: ProductFieldDraft] }>()
const statusDraft = computed(() => props.draft.kind === 'status' ? props.draft : null)

function updateText(value: string) {
  if (props.draft.kind === 'status') return
  emit('update', { ...props.draft, value })
}

function updateStatus(field: 'available' | 'isVisible' | 'featured', value: boolean) {
  if (props.draft.kind !== 'status') return
  emit('update', { ...props.draft, [field]: value })
}
</script>

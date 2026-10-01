<template>
  <!-- Airbnb's cancellation picker: a policy chosen by name, each card saying what it means for the guest. -->
  <DashboardLeafPanel
    id="calendar-settings-cancellation"
    title="Cancellation policy"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <URadioGroup :model-value="chosen ?? undefined" :items="items" variant="card" class="w-full" @update:model-value="choose($event as CancellationTierId)">
      <template #description="{ item }">
        <ul class="mt-1 list-disc space-y-1 pl-5">
          <li v-for="point in (item as typeof items[number]).points" :key="point">{{ point }}</li>
        </ul>
      </template>
    </URadioGroup>
    <p v-if="!chosen" class="mt-4 text-sm text-muted">{{ current }}</p>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { CANCELLATION_TIERS, cancellationPatch, cancellationSummary, cancellationTierOf, type CancellationTierId } from '~/shared/availability-settings'
import { useCalendarLocationEditor } from '~/composables/useCalendarLocationEditor'

definePageMeta({ layout: 'dashboard' })

const editor = await useCalendarLocationEditor('reservations')
const items = CANCELLATION_TIERS.map(tier => ({ value: tier.id, label: tier.label, points: tier.points, description: tier.points.join(' ') }))
const chosen = computed(() => cancellationTierOf(editor.reservationForm.value))
// A stored value no tier names — set through MCP or the older form — is said, not silently replaced.
const current = computed(() => `Currently: ${cancellationSummary(editor.reservationForm.value)}. Choosing a policy replaces it.`)
function choose(tier: CancellationTierId) {
  editor.reservationForm.value = { ...editor.reservationForm.value, ...cancellationPatch(tier) }
}
</script>

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
    <div class="mx-auto w-full max-w-md space-y-3">
      <button
        v-for="tier in CANCELLATION_TIERS"
        :key="tier.id"
        type="button"
        class="block w-full rounded-xl border p-4 text-left transition-colors"
        :class="chosen === tier.id ? 'border-highlighted bg-elevated/70 ring-1 ring-highlighted' : 'border-default hover:bg-elevated/50'"
        :aria-pressed="chosen === tier.id"
        @click="choose(tier.id)"
      >
        <span class="block text-lg font-semibold text-highlighted">{{ tier.label }}</span>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li v-for="point in tier.points" :key="point">{{ point }}</li>
        </ul>
      </button>
      <p v-if="!chosen" class="text-sm text-muted">{{ current }}</p>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { CANCELLATION_TIERS, cancellationPatch, cancellationSummary, cancellationTierOf, type CancellationTierId } from '~/shared/availability-settings'
import { useCalendarLocationEditor } from '~/composables/useCalendarLocationEditor'

definePageMeta({ layout: 'dashboard' })

const editor = await useCalendarLocationEditor('reservations')
const chosen = computed(() => cancellationTierOf(editor.reservationForm.value))
// A stored value no tier names — set through MCP or the older form — is said, not silently replaced.
const current = computed(() => `Currently: ${cancellationSummary(editor.reservationForm.value)}. Choosing a policy replaces it.`)
function choose(tier: CancellationTierId) {
  editor.reservationForm.value = { ...editor.reservationForm.value, ...cancellationPatch(tier) }
}
</script>

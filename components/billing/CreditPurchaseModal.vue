<template>
  <UModal v-model:open="isOpen" title="Confirm payment" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-4">
        <!-- Line item -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted">{{ bundleLabel }}</span>
          <span class="font-semibold text-highlighted">{{ bundlePrice }}</span>
        </div>

        <div class="border-t border-default" />

        <!-- Saved card -->
        <div v-if="savedCard" class="flex items-center gap-3 rounded-lg border border-default bg-elevated px-4 py-3">
          <div class="flex size-8 shrink-0 items-center justify-center rounded bg-default text-xs font-bold uppercase tracking-wide text-muted">
            {{ savedCard.brand.slice(0, 4) }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-highlighted">•••• {{ savedCard.last4 }}</p>
            <p class="text-xs text-muted">Expires {{ savedCard.exp_month }}/{{ savedCard.exp_year }}</p>
          </div>
          <UBadge label="Default" color="neutral" variant="soft" size="xs" />
        </div>

        <!-- Auto top-up opt-in -->
        <div class="flex items-center justify-between rounded-lg border border-default px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted">Never run out of credits</p>
            <p class="text-xs text-muted">Auto top-up this amount when balance drops below 100</p>
          </div>
          <USwitch v-model="wantsAutoTopup" class="ml-4 shrink-0" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :disabled="paying" @click="cancel">Cancel</UButton>
        <UButton :loading="paying" @click="confirm">Pay {{ bundlePrice }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { isOpen, savedCard, paying, wantsAutoTopup, bundleLabel, bundlePrice, confirm, cancel } = useCreditPurchase()

watch(isOpen, (open) => {
  if (!open) cancel()
})
</script>

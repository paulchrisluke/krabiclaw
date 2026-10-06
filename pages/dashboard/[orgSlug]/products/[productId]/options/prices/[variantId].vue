<template>
  <!-- The price of one combination: what a customer actually buys. -->
  <DashboardLeafPanel
    id="product-combination-price"
    :ready="p.ready.value && Boolean(variant)"
    :title="variant?.name ?? ''"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || ''"
    @cancel="p.revert"
    @save="p.save(level.to.value ?? undefined)"
  >
    <UFormField v-if="variant" :label="`Amount (${p.currency})`">
      <UInput v-model="variant.price_major" inputmode="decimal" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const route = useRoute()
const level = useRouteLevel()
// The saved variant's id, never the label its choices happen to spell.
const variant = computed(() => p.form.variants.find(entry => entry.id === String(route.params.variantId)) ?? null)

watchEffect(() => {
  if (p.ready.value && !variant.value) showError(createError({ statusCode: 404, statusMessage: 'Combination not found' }))
})
</script>

<template>
  <DashboardLeafPanel
    id="product-order-url"
    :title="p.sectionLabels['order-url']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <UFormField label="Order URL" description="Where a customer goes to order this. Not the page it is shown on.">
      <UInput v-model="p.form.order_url" type="url" placeholder="https://…" class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>

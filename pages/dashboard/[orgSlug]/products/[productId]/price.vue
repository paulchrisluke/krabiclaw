<template>
  <DashboardLeafPanel
    id="product-price"
    lead="Set an amount, or use price wording such as Market price. Leave both empty to show no price."
    :title="p.sectionLabels['price']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.loadError.value || p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <!-- One price, on the one thing being bought. A product with options prices each combination under Options. -->
    <div v-if="p.isNew.value || p.product.value" class="space-y-5">
      <template v-if="p.form.variants.length === 1">
        <UFormField :label="`Amount (${p.currency})`">
          <UInput v-model="p.form.variants[0]!.price_major" inputmode="decimal" placeholder="280" class="w-full" data-testid="product-price" />
        </UFormField>
        <UFormField label="Price wording" hint="Optional">
          <UInput :model-value="p.textValue(priceWording)" placeholder="Market price" class="w-full" @update:model-value="p.setDetail(priceWording, $event)" />
        </UFormField>
      </template>
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        icon="i-lucide-list"
        title="This has multiple variants"
        description="Each variant has its own price. Edit them under Variants."
      />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { PRODUCT_DETAIL_FIELDS } from '~/shared/product-details'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const priceWording = PRODUCT_DETAIL_FIELDS.find(field => field.key === 'pricing_note')!
</script>

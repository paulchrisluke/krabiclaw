<template>
  <DashboardLeafPanel
    id="product-price"
    :title="p.sectionLabels['price']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <!-- One price, on the one thing being bought. A product with options prices each combination under Options. -->
    <div class="space-y-5">
      <template v-if="p.form.variants.length === 1">
        <UFormField :label="`Amount (${p.currency})`" description="Leave empty if this is not purchasable. Zero is a real price and means free.">
          <UInput v-model="p.form.variants[0]!.price_major" inputmode="decimal" placeholder="280" class="w-full" data-testid="product-price" />
        </UFormField>
      </template>
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        icon="i-lucide-list"
        title="This has options"
        description="Each combination has its own price. Edit them under Options."
      />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>

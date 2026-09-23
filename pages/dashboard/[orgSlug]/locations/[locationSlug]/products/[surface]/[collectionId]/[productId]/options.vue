<template>
  <DashboardLeafPanel
    id="product-options"
    :title="p.sectionLabels['options']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <!-- A combination is what a customer actually buys, so it carries the price, and every combination has to be answered. -->
    <div class="space-y-6">
      <div v-for="(option, optionIndex) in p.form.options" :key="option.id" class="space-y-2 rounded-lg border border-default p-3">
        <div class="flex items-center gap-2">
          <UInput v-model="option.name" placeholder="Size" :maxlength="PRODUCT_LIMITS.optionName" class="flex-1" aria-label="Option name" />
          <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="`Remove ${option.name || 'option'}`" @click="p.removeOption(optionIndex)" />
        </div>
        <UInputTags
          :model-value="option.values.map((value: { value: string }) => value.value)"
          placeholder="Add a value"
          :max="PRODUCT_LIMITS.optionValues"
          :max-length="PRODUCT_LIMITS.optionValue"
          delimiter=","
          add-on-blur
          add-on-paste
          class="w-full"
          @update:model-value="p.setOptionValues(optionIndex, $event as string[])"
        />
      </div>
      <UButton v-if="p.form.options.length < PRODUCT_LIMITS.options" label="Add an option" icon="i-lucide-plus" color="neutral" variant="soft" @click="p.addOption" />

      <div v-if="p.form.variants.length > 1" class="space-y-2">
        <p class="text-sm font-semibold text-highlighted">Combinations</p>
        <div v-for="variant in p.form.variants" :key="variant.key" class="flex items-center gap-3 rounded-lg border border-default p-3">
          <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ variant.name }}</span>
          <UInput v-model="variant.price_major" inputmode="decimal" :placeholder="`Amount (${p.currency})`" class="w-40" />
        </div>
      </div>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { PRODUCT_LIMITS } from '~/shared/product-limits'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>

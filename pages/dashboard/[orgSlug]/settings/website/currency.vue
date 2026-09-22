<template>
  <DashboardLeafPanel
    id="site-currency"
    title="Currency"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <USelect :model-value="editor.form.default_currency ?? undefined" :items="CURRENCY_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" placeholder="Select currency" @update:model-value="editor.form.default_currency = ($event as CurrencyCode | undefined) ?? null" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { CURRENCY_OPTIONS, type CurrencyCode } from '~/shared/currencies'
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>

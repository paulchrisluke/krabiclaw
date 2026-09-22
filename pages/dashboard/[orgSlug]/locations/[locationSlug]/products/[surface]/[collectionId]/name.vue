<template>
  <DashboardLeafPanel
    id="location-product-category-name"
    title="Name"
    :saving="c.saving.value"
    :disabled="c.saveDisabled.value"
    :save-label="c.saveLabel.value"
    :error="c.errorMessage.value"
    @cancel="c.revert"
    @save="c.save"
  >
    <UFormField label="Name" required>
      <UInput v-model="c.form.name" :placeholder="c.groupLabel === 'Section' ? 'Appetizers' : 'Accessories'" size="xl" autofocus class="w-full" />
    </UFormField>
    <DashboardResourceLocalization
      v-if="!c.isNew.value && c.hasRecord.value"
      class="mt-6"
      :site-id="c.siteId"
      resource-type="collection"
      :resource-id="c.collectionId.value"
      :resource-label="c.groupLabel.toLowerCase()"
      :fields="c.localizationFields.value"
      :language-settings-path="c.siteLocalizationSettingsPath.value"
    />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { collectionEditorKey } from '../[collectionId].vue'

definePageMeta({ layout: 'dashboard' })

const c = inject(collectionEditorKey)!
</script>

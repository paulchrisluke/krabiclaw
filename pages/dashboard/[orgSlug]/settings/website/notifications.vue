<template>
  <DashboardLeafPanel
    id="site-notifications"
    title="WhatsApp number"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <!--
      The number the business is reached on. Which channels a person wants is
      their own setting, at /dashboard/account/profile/notifications.
    -->
    <UFormField label="Site-wide WhatsApp number" hint="Used when a location has no number of its own.">
      <UInput v-model="editor.whatsappPhone.value" type="tel" placeholder="+66..." size="xl" class="w-full" />
    </UFormField>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>

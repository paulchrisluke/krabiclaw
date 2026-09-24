<template>
  <DashboardLeafPanel
    id="organization-font"
    title="Website font"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    :footer="editor.supportsOrganizationFonts.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <template v-if="editor.supportsOrganizationFonts.value">
      <UFormField label="Website font">
        <USelect v-model="editor.form.font_preset" :items="ORGANIZATION_FONT_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" />
      </UFormField>
      <div class="mt-6 space-y-3 rounded-lg border border-default p-5 text-2xl leading-relaxed" :style="organizationFontStyles(editor.form.font_preset)" data-testid="site-font-preview">
        <p lang="en">Welcome · 123</p>
        <p lang="th">ยินดีต้อนรับ · ๑๒๓</p>
      </div>
    </template>
    <p v-else class="text-base text-muted">Font presets are available for the Saya template.</p>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { ORGANIZATION_FONT_OPTIONS, organizationFontStyles } from '~/shared/organization-fonts'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>

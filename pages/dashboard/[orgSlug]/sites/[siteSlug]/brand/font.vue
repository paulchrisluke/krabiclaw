<template>
  <DashboardLeafPanel
    id="site-font"
    title="Website font"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    :footer="editor.supportsSiteFonts.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <template v-if="editor.supportsSiteFonts.value">
      <UFormField label="Website font">
        <USelect v-model="editor.form.font_preset" :items="SITE_FONT_OPTIONS" value-key="value" label-key="label" size="xl" class="w-full" />
      </UFormField>
      <div class="mt-6 space-y-3 rounded-lg border border-default p-5 text-2xl leading-relaxed" :style="siteFontStyles(editor.form.font_preset)" data-testid="site-font-preview">
        <p lang="en">Welcome · 123</p>
        <p lang="th">ยินดีต้อนรับ · ๑๒๓</p>
      </div>
    </template>
    <p v-else class="text-base text-muted">Font presets are available for the Saya template.</p>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { SITE_FONT_OPTIONS, siteFontStyles } from '~/shared/site-fonts'
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>

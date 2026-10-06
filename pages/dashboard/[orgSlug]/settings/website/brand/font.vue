<template>
  <DashboardLeafPanel
    id="organization-font"
    title="Website font"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Website font">
      <USelect v-model="editor.form.font_preset" :items="fontItems" value-key="value" label-key="label" class="w-full" />
    </UFormField>
    <div class="mt-6 space-y-3 rounded-lg border border-default p-5 leading-relaxed" :data-font-template="editor.theme.value" :data-font-preset="editor.form.font_preset" data-testid="site-font-preview">
      <p lang="en" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] text-3xl">Welcome · 123</p>
      <p lang="th" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] text-3xl">ยินดีต้อนรับ · ๑๒๓</p>
      <p lang="en" class="font-sans text-base">Book a table, browse the menu or send us a message.</p>
      <p lang="th" class="font-sans text-base">จองโต๊ะ ดูเมนู หรือส่งข้อความถึงเรา</p>
    </div>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { ORGANIZATION_FONT_OPTIONS } from '~/shared/organization-fonts'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
const fontItems = [...ORGANIZATION_FONT_OPTIONS]
</script>

<template>
  <DashboardLeafPanel
    id="organization-page-search"
    title="Search appearance"
    :ready="editor.ready.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div class="space-y-6">
      <UFormField label="SEO title" description="Falls back to the page title.">
        <UInput v-model="editor.draft.value.seo_title" size="xl" maxlength="200" autofocus class="w-full" />
      </UFormField>
      <UFormField label="SEO description">
        <UTextarea v-model="editor.draft.value.seo_description" :rows="3" autoresize maxlength="500" class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
/** The stored directive, or nothing: an unrecognised value is not shown as one of the known ones. */
</script>

<template>
  <DashboardLeafPanel
    id="organization-page-canonical"
    title="Canonical URL"
    :ready="editor.ready.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField
      label="Canonical URL"
      description="An absolute URL on one of this site's active domains. Leave empty to use this page's own address."
    >
      <UInput v-model="editor.draft.value.canonical_url" size="xl" placeholder="https://example.com/about" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
</script>

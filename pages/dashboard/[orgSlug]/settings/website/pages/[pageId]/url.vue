<template>
  <DashboardLeafPanel
    id="organization-page-url"
    title="URL"
    lead="Where this page lives on your website. Changing it keeps the old address working by redirecting it here."
    :ready="editor.ready.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value || Boolean(pathError)"
    :save-label="editor.saveLabel.value"
    :error="pathError || editor.errorMessage.value"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UFormField label="Path" required>
      <UInput v-model="editor.draft.value.path" autofocus class="w-full" />
    </UFormField>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
// The page writer decides whether a path is free; this only refuses one that is not a path at all.
const pathError = computed(() => (editor.draft.value.path.startsWith('/') ? '' : 'Start the path with /.'))
</script>

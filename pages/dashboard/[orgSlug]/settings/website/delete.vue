<template>
  <DashboardLeafPanel
    id="organization-delete"
    title="Delete site"
    :ready="!editor.loading.value"
    :footer="false"
    @cancel="editor.revert"
  >
    <p class="text-base text-muted">
      Permanently deletes this organization, its site, locations, content and media, and removes access for its other members. Any active or trialing subscription is cancelled first. This cannot be undone.
    </p>
    <UAlert v-if="editor.deletionError.value" class="mt-4" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.deletionError.value" />
    <UFormField class="mt-6" label="Type DELETE to confirm">
      <UInput v-model="editor.deletionConfirmText.value" placeholder="DELETE" :disabled="editor.deletionSaving.value" class="w-full" />
    </UFormField>
    <UButton class="mt-6" color="error" variant="solid" size="lg" :disabled="editor.deletionConfirmText.value !== 'DELETE'" :loading="editor.deletionSaving.value" @click="editor.deleteWorkspace">Delete permanently</UButton>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>

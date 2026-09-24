<template>
  <DashboardLeafPanel
    id="organization-delete"
    title="Delete site"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    :footer="false"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <template v-if="editor.deletionScheduledAt.value">
      <UAlert
        color="warning"
        variant="soft"
        icon="i-lucide-clock"
        title="Deletion scheduled"
        :description="`This workspace — the site, its locations, content and media — is deleted on ${editor.deletionDateLabel.value}. Everything stays online until then, and the address stays reserved.`"
      />
      <UAlert v-if="editor.deletionError.value" class="mt-4" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.deletionError.value" />
      <UButton class="mt-6" color="neutral" variant="solid" size="lg" :loading="editor.deletionSaving.value" @click="editor.keepWorkspace">Keep this workspace</UButton>
    </template>
    <template v-else>
      <p class="text-base text-muted">
        This schedules the whole workspace for deletion in {{ editor.deletionGraceDays.value }} days: this site, its locations, content, media and the organization itself. Nothing is removed today, the site stays online, and you can cancel here until then.
      </p>
      <UAlert v-if="editor.deletionError.value" class="mt-4" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.deletionError.value" />
      <UFormField class="mt-6" label="Type DELETE to confirm">
        <UInput v-model="editor.deletionConfirmText.value" placeholder="DELETE" :disabled="editor.deletionSaving.value" class="w-full" />
      </UFormField>
      <UButton class="mt-6" color="error" variant="solid" size="lg" :disabled="editor.deletionConfirmText.value !== 'DELETE'" :loading="editor.deletionSaving.value" @click="editor.scheduleWorkspaceDeletion">Schedule deletion</UButton>
    </template>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>

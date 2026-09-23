<template>
  <DashboardLeafPanel
    id="site-publishing"
    title="Facebook publishing"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    :footer="false"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <UAlert v-if="!editor.hasFacebookAccess.value" color="warning" variant="soft" icon="i-lucide-lock" title="Growth plan required" description="Upgrade this site to connect Facebook and Instagram publishing." />
    <UCard v-else variant="subtle">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-semibold text-highlighted">{{ editor.facebookConnection.value?.connected ? 'Connected' : 'Not connected' }}</p>
          <p v-if="editor.facebookConnection.value?.page_name" class="mt-1 text-sm text-muted">{{ editor.facebookConnection.value.page_name }}</p>
        </div>
        <UButton icon="i-simple-icons-facebook" :loading="editor.connectingFacebook.value" @click="editor.startFacebookConnect">{{ editor.facebookConnection.value?.connected ? 'Reconnect' : 'Connect' }}</UButton>
      </div>
    </UCard>
    <UAlert v-if="editor.facebookError.value" color="error" variant="soft" icon="i-lucide-circle-alert" :description="editor.facebookError.value" class="mt-4" />
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { siteSettingsEditorKey } from '~/lib/components/workspace/settings/SiteSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(siteSettingsEditorKey)!
</script>

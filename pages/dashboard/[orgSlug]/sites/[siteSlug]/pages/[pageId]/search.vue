<template>
  <DashboardLeafPanel
    id="site-page-search"
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
      <UFormField label="Robots" description="Whether search engines may index and follow this page.">
        <USelect
          :model-value="robotsValue"
          :items="ROBOTS_OPTIONS"
          value-key="value"
          label-key="label"
          size="xl"
          class="w-full"
          @update:model-value="editor.draft.value.robots = String($event)"
        />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { tenantPageEditorKey, ROBOTS_OPTIONS } from '~/components/dashboard/TenantPageEditorPage.vue'
import { ROBOTS_INTENTS } from '~/shared/robots-directive'

definePageMeta({ layout: 'dashboard' })

const editor = inject(tenantPageEditorKey)!
/** The stored directive, or nothing: an unrecognised value is not shown as one of the known ones. */
const robotsValue = computed(() => ROBOTS_INTENTS.find(intent => intent === editor.draft.value.robots))
</script>

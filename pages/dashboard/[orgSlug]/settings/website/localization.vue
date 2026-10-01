<template>
  <DashboardLeafPanel
    id="organization-localization"
    title="Languages"
    lead="English is the permanent source language. Growth includes two secondary languages at no extra cost."
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <div v-if="editor.localizationLoading.value" class="space-y-3">
      <USkeleton class="h-16 rounded-lg" />
      <USkeleton class="h-16 rounded-lg" />
    </div>
    <UAlert v-else-if="editor.localizationError.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.localizationError.value" />
    <template v-else-if="editor.localizationSettings.value">
      <!-- One row per language: its name, then where it stands in one line. -->
      <ul>
        <li v-for="language in editor.localizationSettings.value.languages" :key="language.locale" class="flex flex-wrap items-center justify-between gap-4 border-b border-default py-6 last:border-b-0">
          <div class="min-w-0">
            <p class="text-base text-highlighted">{{ language.label || language.locale }}</p>
            <p class="mt-1 text-sm text-muted">{{ languageSummary(language) }}</p>
          </div>
          <div v-if="!language.is_source" class="flex gap-2">
            <UButton v-if="language.status === 'disabled'" :loading="editor.localizationBusy.value" @click="editor.publishLanguage(language.locale)">Publish</UButton>
            <UButton v-if="language.status === 'published'" color="neutral" variant="outline" :loading="editor.localizationBusy.value" @click="editor.disableLanguage(language.locale)">Disable</UButton>
            <UButton v-if="language.status === 'disabled'" color="error" variant="outline" :loading="editor.localizationBusy.value" @click="editor.deleteLanguage(language.locale)">Delete content</UButton>
          </div>
        </li>
      </ul>
      <!-- What is left to translate, as rows that open the field's own editor. -->
      <section v-for="progress in editor.localizationProgress.value" :key="progress.locale" class="mt-8">
        <h2 class="text-sm font-semibold text-muted">Left to translate · {{ progress.locale }}</h2>
        <ul v-if="progress.opportunities.length">
          <li v-for="item in progress.opportunities" :key="item.id" class="border-b border-default last:border-b-0">
            <NuxtLink :to="`${editor.organizationDashboardPath.value}/${item.path}`" class="flex items-center justify-between gap-4 py-6">
              <span class="text-base text-highlighted">{{ item.label }}</span>
              <span class="flex items-center gap-2 text-sm text-muted">
                {{ item.total - item.completed }} left
                <UIcon name="i-lucide-chevron-right" class="size-5" />
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-muted">Every source field with content has a translation.</p>
      </section>
      <UAlert v-if="editor.localizationProgressError.value" class="mt-6" color="error" variant="soft" :description="editor.localizationProgressError.value" />
      <p v-if="!editor.enableableCatalogOptions.value.length" class="mt-6 text-sm text-muted">No additional languages are available to enable right now.</p>
      <UFormField v-else class="mt-8" label="Add a language">
        <USelect v-model="editor.newLocale.value" :items="editor.enableableCatalogOptions.value" placeholder="Select a language to enable" class="w-full" />
      </UFormField>
    </template>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!

type Language = NonNullable<typeof editor.localizationSettings.value>['languages'][number]
// The language's state and, for a translation, how much of the site it covers.
function languageSummary(language: Language): string {
  if (language.is_source) return 'Source · published'
  const progress = editor.localizationProgress.value.find(entry => entry.locale === language.locale)
  const state = language.status === 'published' ? 'Published' : 'Not published'
  return progress ? `${state} · ${progress.completed}/${progress.total} translated` : state
}
</script>

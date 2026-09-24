<template>
  <DashboardLeafPanel
    id="organization-localization"
    title="Languages"
    :ready="!editor.loading.value"
    :saving="editor.saving.value"
    :disabled="editor.saveDisabled.value"
    :error="editor.editorError.value ?? ''"
    @cancel="editor.revert"
    @save="editor.save"
  >
    <p class="text-base text-muted">
      English is the permanent source language. Growth includes two secondary languages at no extra cost.
    </p>
    <div v-if="editor.localizationLoading.value" class="mt-6 space-y-3">
      <USkeleton class="h-16 rounded-lg" />
      <USkeleton class="h-16 rounded-lg" />
    </div>
    <UAlert v-else-if="editor.localizationError.value" class="mt-6" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.localizationError.value" />
    <template v-else-if="editor.localizationSettings.value">
      <div class="mt-6 space-y-3">
        <div v-for="language in editor.localizationSettings.value.languages" :key="language.locale" class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default p-4">
          <div>
            <p class="font-medium">{{ language.label || language.locale }} <span class="text-sm text-muted">({{ language.locale }})</span></p>
            <UBadge :color="language.is_source || language.status === 'published' ? 'success' : 'neutral'" variant="subtle" size="sm" class="mt-1">
              {{ language.is_source ? 'Source · published' : language.status === 'published' ? 'published' : 'Not published' }}
            </UBadge>
          </div>
          <div v-if="!language.is_source" class="flex gap-2">
            <UButton v-if="language.status === 'disabled'" color="primary" :loading="editor.localizationBusy.value" @click="editor.publishLanguage(language.locale)">Publish</UButton>
            <UButton v-if="language.status === 'published'" color="neutral" variant="outline" :loading="editor.localizationBusy.value" @click="editor.disableLanguage(language.locale)">Disable</UButton>
            <UButton v-if="language.status === 'disabled'" color="error" variant="outline" :loading="editor.localizationBusy.value" @click="editor.deleteLanguage(language.locale)">Delete content</UButton>
          </div>
        </div>
      </div>
      <UCard v-for="progress in editor.localizationProgress.value" :key="progress.locale" class="mt-6" variant="soft">
        <template #header>
          <div>
            <h3 class="font-semibold text-highlighted">Let’s translate your site</h3>
            <p class="mt-1 text-sm text-muted">{{ progress.completed }}/{{ progress.total }} fields translated in {{ progress.locale }}.</p>
          </div>
        </template>
        <div v-if="progress.opportunities.length" class="divide-y divide-default">
          <NuxtLink
            v-for="item in progress.opportunities"
            :key="item.id"
            :to="`${editor.organizationDashboardPath.value}/${item.path}`"
            class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <span class="font-medium text-highlighted">{{ item.label }}</span>
            <span class="flex items-center gap-2 text-sm text-muted">
              {{ item.total - item.completed }} left
              <UIcon name="i-lucide-chevron-right" class="size-4" />
            </span>
          </NuxtLink>
        </div>
        <UAlert v-else color="success" variant="soft" title="Translation is complete" description="Every source field with content has a translation." />
      </UCard>
      <UAlert v-if="editor.localizationProgressError.value" class="mt-6" color="error" variant="soft" :description="editor.localizationProgressError.value" />
      <p v-if="!editor.enableableCatalogOptions.value.length" class="mt-6 text-sm text-muted">No additional languages are available to enable right now.</p>
      <UFormField v-else class="mt-6" label="Available language">
        <USelect v-model="editor.newLocale.value" :items="editor.enableableCatalogOptions.value" placeholder="Select a language to enable" size="xl" class="w-full" />
      </UFormField>
    </template>
    <UAlert v-if="editor.validationMessage.value" class="mt-6" color="error" variant="soft" :description="editor.validationMessage.value" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
</script>

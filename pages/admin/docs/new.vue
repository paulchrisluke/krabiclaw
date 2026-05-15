<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">New Documentation</h1>
        <p class="mt-1 text-sm text-muted">Create a new documentation page.</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-heroicons-arrow-left">Admin</UButton>
    </div>

    <UCard>
      <div class="space-y-4">
        <UFormField label="Title">
          <UInput v-model="form.title" placeholder="Getting Started with KrabiClaw" size="lg" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Category">
            <USelect
              v-model="form.category"
              :items="categoryItems"
              value-key="value"
              label-key="label"
              placeholder="Select a category"
            />
          </UFormField>
          <UFormField label="Difficulty Level">
            <USelect
              v-model="form.difficulty_level"
              :items="difficultyItems"
              value-key="value"
              label-key="label"
              placeholder="Select difficulty"
            />
          </UFormField>
        </div>

        <UFormField label="Excerpt">
          <UTextarea v-model="form.excerpt" :rows="3" placeholder="One or two sentences that summarize this documentation." />
        </UFormField>

        <UFormField label="SEO Description">
          <UTextarea v-model="form.seo_description" :rows="2" placeholder="Meta description for search engines (150-160 characters recommended)" />
        </UFormField>

        <UFormField label="SEO Keywords">
          <UInput v-model="form.seo_keywords" placeholder="restaurant, website builder, menu management" />
        </UFormField>

        <UFormField label="Body (Markdown)">
          <UTextarea
            v-model="form.body"
            :rows="18"
            placeholder="Write your documentation in Markdown..."
            class="font-mono text-sm"
          />
        </UFormField>

        <UFormField label="Featured Image">
          <PlatformMediaPicker v-model="form.featured_image_asset_id" @change="handleImageChange" />
        </UFormField>

        <div v-if="errorMessage || successMessage" class="space-y-2">
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :description="errorMessage" />
          <UAlert v-if="successMessage" color="success" variant="soft" icon="i-heroicons-check-circle" :description="successMessage" />
        </div>

        <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
          <UButton color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="save(false)">
            Save draft
          </UButton>
          <UButton :loading="saving" :disabled="!canPublish" @click="save(true)">
            Publish
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { categories, difficultyLevels } from '~/config/documentation'
import { getErrorMessage } from '~/utils/errors'
import { useDocForm } from '~/composables/useDocForm'

interface CreateDocResponse {
  id: string | number
  [key: string]: ApiValue
}

definePageMeta({ layout: 'dashboard' })

const { form, canSave, canPublish, handleImageChange } = useDocForm()

const categoryItems = computed(() => categories.map((item) => ({ label: item, value: item })))
const difficultyItems = computed(() => difficultyLevels.map((item) => ({ label: item, value: item })))

const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')


async function save(publish: boolean) {
  if (publish && (!form.title.trim() || !form.body.trim())) {
    errorMessage.value = 'Title and body are required to publish.'
    return
  }
  if (!publish && !form.title.trim() && !form.body.trim()) {
    errorMessage.value = 'Title or body is required to save a draft.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await $fetch<CreateDocResponse>('/api/admin/docs', {
      method: 'POST',
      body: { ...form, publish }
    })
    await navigateTo(`/admin/docs/${res.id}`)
  } catch (err) {
    errorMessage.value = getErrorMessage(err, publish ? 'Failed to publish.' : 'Failed to save draft.')
  } finally {
    saving.value = false
  }
}


useSeoMeta({ title: 'New Documentation | Admin' })
</script>

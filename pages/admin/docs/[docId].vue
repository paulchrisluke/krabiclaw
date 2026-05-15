<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">Edit Documentation</h1>
        <p class="mt-1 text-sm text-muted">{{ doc?.slug ? `/docs/${doc.slug}` : 'Documentation draft' }}</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-heroicons-arrow-left">Admin</UButton>
    </div>

    <UCard v-if="loadPending">
      <div class="flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
        Loading doc...
      </div>
    </UCard>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="loadError"
    />

    <UCard v-else>
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
          <UButton color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="update(false)">
            Save changes
          </UButton>
          <UButton :loading="saving" :disabled="!canPublish" @click="update(true)">
            Publish
          </UButton>
          <UButton v-if="doc?.status === 'published'" color="neutral" variant="ghost" :loading="saving" @click="unpublish">
            Unpublish
          </UButton>
          <UButton color="error" variant="ghost" :loading="saving" @click="remove">
            Delete
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

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const docId = route.params.docId as string

const { form, canSave, canPublish, handleImageChange } = useDocForm()

const categoryItems = computed(() => categories.map((item) => ({ label: item, value: item })))
const difficultyItems = computed(() => difficultyLevels.map((item) => ({ label: item, value: item })))

interface Doc {
  id: string
  title: string
  slug?: string | null
  excerpt?: string | null
  category?: string | null
  difficulty_level?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  featured_image_asset_id?: string | null
  body: string
  status?: string | null
  published_at?: string | null
}

interface DocResponse {
  doc?: Doc
}

const doc = ref<Doc | null>(null)
const loadPending = ref(true)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(loadDoc)

async function loadDoc() {
  loadPending.value = true
  loadError.value = ''
  try {
    const res = await $fetch<DocResponse>(`/api/admin/docs/${docId}`)
    if (!res.doc) throw new Error('Doc not found')
    doc.value = res.doc
    form.title = res.doc.title
    form.excerpt = res.doc.excerpt ?? ''
    form.category = res.doc.category ?? ''
    form.difficulty_level = res.doc.difficulty_level ?? ''
    form.seo_description = res.doc.seo_description ?? ''
    form.seo_keywords = res.doc.seo_keywords ?? ''
    form.body = res.doc.body
    form.featured_image_asset_id = res.doc.featured_image_asset_id ?? ''
  } catch (err) {
    loadError.value = getErrorMessage(err, 'Failed to load doc.')
  } finally {
    loadPending.value = false
  }
}

async function update(publish = false) {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await $fetch<DocResponse>(`/api/admin/docs/${docId}`, {
      method: 'PATCH',
      body: { ...form, ...(publish ? { publish: true } : {}) }
    })
    if (!updated.doc) throw new Error('Doc not found after save')
    doc.value = updated.doc
    successMessage.value = publish ? 'Published.' : 'Saved.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

async function unpublish() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await $fetch<DocResponse>(`/api/admin/docs/${docId}`, { method: 'PATCH', body: { unpublish: true } })
    if (!updated.doc) throw new Error('Doc not found after unpublish')
    doc.value = updated.doc
    successMessage.value = 'Doc unpublished.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to unpublish.')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete this doc permanently?')) return
  saving.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/admin/docs/${docId}`, { method: 'DELETE' })
    await navigateTo('/admin')
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to delete.')
  } finally {
    saving.value = false
  }
}


useSeoMeta({ title: 'Edit Documentation | Admin' })
</script>

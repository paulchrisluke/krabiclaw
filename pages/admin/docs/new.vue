<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">New Documentation</h1>
        <p class="mt-1 text-sm text-muted">Create a new documentation page.</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-lucide-arrow-left">Admin</UButton>
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

        <UFormField label="Canonical URL" hint="Optional">
          <UInput v-model="form.canonical_url" placeholder="Leave blank to use the generated page canonical" />
        </UFormField>

        <UFormField label="Robots">
          <USelect
            v-model="form.robots"
            :items="robotsItems"
            value-key="value"
            label-key="label"
            placeholder="Default (index,follow)"
          />
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

        <div class="space-y-4 border-t border-default pt-4">
          <div>
            <h2 class="text-sm font-semibold text-default">Structured content</h2>
            <p class="text-xs text-muted">Add FAQ and How-To blocks only when the doc visibly includes them.</p>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium text-default">FAQ</h3>
              <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-plus" @click="addFaqItem">
                Add question
              </UButton>
            </div>

            <div v-if="form.faq_items.length" class="space-y-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Label" hint="Optional">
                  <UInput v-model="form.faq_label" placeholder="e.g. Frequently Asked Questions" />
                </UFormField>
                <UFormField label="Status">
                  <USelect v-model="form.faq_status" :items="componentStatusItems" value-key="value" label-key="label" />
                </UFormField>
              </div>
              <div class="flex flex-wrap gap-4">
                <USwitch v-model="form.faq_render_enabled" label="Show on page" />
                <USwitch v-model="form.faq_schema_enabled" label="Emit structured data" />
              </div>

              <UCard v-for="(item, index) in form.faq_items" :key="`faq-${index}`">
                <div class="space-y-3">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormField label="Question">
                      <UInput v-model="item.question" placeholder="How do I change my homepage title?" />
                    </UFormField>
                    <UFormField label="Answer">
                      <UTextarea v-model="item.answer" :rows="3" placeholder="Write the visible answer readers should see." />
                    </UFormField>
                  </div>
                  <div class="flex gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" :disabled="index === 0" @click="moveItem(form.faq_items, index, -1)">Up</UButton>
                    <UButton color="neutral" variant="ghost" size="sm" :disabled="index === form.faq_items.length - 1" @click="moveItem(form.faq_items, index, 1)">Down</UButton>
                    <UButton color="error" variant="ghost" size="sm" @click="removeFaqItem(index)">Remove</UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-medium text-default">How-To</h3>
              <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-plus" @click="addHowToStep">
                Add step
              </UButton>
            </div>

            <div v-if="form.how_to_steps.length" class="space-y-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Label" hint="Optional">
                  <UInput v-model="form.how_to_label" placeholder="e.g. How It Works" />
                </UFormField>
                <UFormField label="Status">
                  <USelect v-model="form.how_to_status" :items="componentStatusItems" value-key="value" label-key="label" />
                </UFormField>
              </div>
              <div class="flex flex-wrap gap-4">
                <USwitch v-model="form.how_to_render_enabled" label="Show on page" />
                <USwitch v-model="form.how_to_schema_enabled" label="Emit structured data" />
              </div>

              <UCard v-for="(step, index) in form.how_to_steps" :key="`howto-${index}`">
                <div class="space-y-3">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormField :label="`Step ${index + 1} title`">
                      <UInput v-model="step.name" placeholder="Open the theme editor" />
                    </UFormField>
                    <UFormField label="Optional URL">
                      <UInput v-model="step.url" placeholder="https://krabiclaw.com/docs/example" />
                    </UFormField>
                  </div>

                  <UFormField label="Step text">
                    <UTextarea v-model="step.text" :rows="3" placeholder="Describe exactly what the reader should do." />
                  </UFormField>

                  <UFormField label="Step image">
                    <PlatformMediaPicker v-model="step.image_asset_id" />
                  </UFormField>

                  <div class="flex gap-2">
                    <UButton color="neutral" variant="ghost" size="sm" :disabled="index === 0" @click="moveItem(form.how_to_steps, index, -1)">Up</UButton>
                    <UButton color="neutral" variant="ghost" size="sm" :disabled="index === form.how_to_steps.length - 1" @click="moveItem(form.how_to_steps, index, 1)">Down</UButton>
                    <UButton color="error" variant="ghost" size="sm" @click="removeHowToStep(index)">Remove</UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>

        <div v-if="errorMessage || successMessage" class="space-y-2">
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="errorMessage" />
          <UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />
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
import { createEmptyFaqItem, createEmptyHowToStep } from '~/composables/useBlogForm'
import { useDocForm } from '~/composables/useDocForm'

interface CreateDocResponse {
  id: string | number
  [key: string]: ApiValue
}

definePageMeta({ layout: 'dashboard' })

const { form, canSave, canPublish, handleImageChange } = useDocForm()
const categoryItems = computed(() => categories.map((item) => ({ label: item, value: item })))
const difficultyItems = computed(() => difficultyLevels.map((item) => ({ label: item, value: item })))
const robotsItems = [
  { label: 'Default (index,follow)', value: '' },
  { label: 'index,follow', value: 'index,follow' },
  { label: 'noindex,follow', value: 'noindex,follow' },
  { label: 'index,nofollow', value: 'index,nofollow' },
  { label: 'noindex,nofollow', value: 'noindex,nofollow' },
]
const componentStatusItems = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

form.faq_items = []
form.how_to_steps = []

function addFaqItem() {
  form.faq_items.push(createEmptyFaqItem())
}

function removeFaqItem(index: number) {
  form.faq_items.splice(index, 1)
}

function addHowToStep() {
  form.how_to_steps.push(createEmptyHowToStep())
}

function removeHowToStep(index: number) {
  form.how_to_steps.splice(index, 1)
}

function moveItem<T>(items: T[], index: number, delta: number) {
  const nextIndex = index + delta
  if (nextIndex < 0 || nextIndex >= items.length) return
  const [item] = items.splice(index, 1)
  if (item === undefined) return
  items.splice(nextIndex, 0, item)
}

function buildPayload() {
  return {
    ...form,
    canonical_url: form.canonical_url.trim() || null,
    robots: form.robots.trim() || null,
    faq_items: form.faq_items
      .map(item => ({ question: item.question.trim(), answer: item.answer.trim() }))
      .filter(item => item.question && item.answer),
    how_to_steps: form.how_to_steps
      .map(step => ({
        name: step.name.trim(),
        text: step.text.trim(),
        image_asset_id: step.image_asset_id.trim() || undefined,
        url: step.url.trim() || undefined,
      }))
      .filter(step => step.name && step.text),
  }
}

async function save(publish: boolean) {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await $fetch<CreateDocResponse>('/api/admin/docs', {
      method: 'POST',
      body: { ...buildPayload(), publish },
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

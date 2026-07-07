<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">Edit Documentation</h1>
        <p class="mt-1 text-sm text-muted">{{ doc?.slug && doc?.category ? `/docs/${categoryToSlug(doc.category)}/${doc.slug}` : 'Documentation draft' }}</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-lucide-arrow-left">Admin</UButton>
    </div>

    <UCard v-if="loadPending">
      <div class="flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin" />
        Loading doc...
      </div>
    </UCard>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
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

        <div class="grid gap-4 border-t border-default pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="Nav Section" hint="Optional">
            <USelect
              v-model="form.nav_section"
              :items="navSectionItems"
              value-key="value"
              label-key="label"
              placeholder="Use category default"
            />
          </UFormField>
          <UFormField label="Nav Title" hint="Optional">
            <UInput v-model="form.nav_title" placeholder="Short sidebar label" />
          </UFormField>
          <UFormField label="Nav Order" hint="Optional">
            <UInput v-model="form.nav_order" type="number" min="0" placeholder="10" />
          </UFormField>
          <UFormField label="Section Order" hint="Optional">
            <UInput v-model="form.nav_section_order" type="number" min="0" placeholder="20" />
          </UFormField>
          <UFormField label="Featured Order" hint="Optional">
            <UInput v-model="form.featured_order" type="number" min="0" placeholder="1" />
          </UFormField>
          <UFormField label="Hide From Nav">
            <USwitch v-model="form.hide_from_nav" />
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
import { createEmptyFaqItem, createEmptyHowToStep } from '~/composables/useBlogForm'
import { useDocForm } from '~/composables/useDocForm'
import { categoryToSlug } from '~/utils/docs-categories'
import { PLATFORM_DOC_NAV_SECTION_LABELS } from '~/utils/platform-content-nav'

interface DocComponent {
  type: 'faq' | 'how_to'
  label?: string | null
  status?: 'active' | 'inactive' | null
  render_enabled?: boolean | null
  schema_enabled?: boolean | null
  data?: {
    items?: Array<{ question?: string | null; answer?: string | null }>
    steps?: Array<{ name?: string | null; text?: string | null; image_asset_id?: string | null; url?: string | null }>
  } | null
}

interface Doc {
  id: string
  title: string
  slug?: string | null
  excerpt?: string | null
  category?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
  difficulty_level?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  body: string
  status?: string | null
  published_at?: string | null
  components?: DocComponent[]
}

interface DocResponse {
  doc?: Doc
}

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const docId = route.params.docId as string

const { form, canSave, canPublish, handleImageChange } = useDocForm()
const categoryItems = computed(() => categories.map((item) => ({ label: item, value: item })))
const difficultyItems = computed(() => difficultyLevels.map((item) => ({ label: item, value: item })))
const navSectionItems = computed(() => [
  { label: 'Use category default', value: '' },
  ...PLATFORM_DOC_NAV_SECTION_LABELS.map((item) => ({ label: item, value: item })),
])
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

const doc = ref<Doc | null>(null)
const loadPending = ref(true)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(loadDoc)

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

function hydrateStructuredContent(components: DocComponent[] | undefined) {
  const faq = components?.find(component => component.type === 'faq')
  const howTo = components?.find(component => component.type === 'how_to')

  form.faq_items = faq?.data?.items?.map(item => ({
    question: item.question ?? '',
    answer: item.answer ?? '',
  })) ?? []
  form.faq_label = faq?.label ?? ''
  form.faq_status = faq?.status ?? 'active'
  form.faq_render_enabled = faq?.render_enabled ?? true
  form.faq_schema_enabled = faq?.schema_enabled ?? true

  form.how_to_steps = howTo?.data?.steps?.map(step => ({
    name: step.name ?? '',
    text: step.text ?? '',
    image_asset_id: step.image_asset_id ?? '',
    url: step.url ?? '',
  })) ?? []
  form.how_to_label = howTo?.label ?? ''
  form.how_to_status = howTo?.status ?? 'active'
  form.how_to_render_enabled = howTo?.render_enabled ?? true
  form.how_to_schema_enabled = howTo?.schema_enabled ?? true
}

function buildPayload() {
  return {
    ...form,
    canonical_url: form.canonical_url.trim() || null,
    robots: form.robots.trim() || null,
    nav_section: form.nav_section.trim() || null,
    nav_title: form.nav_title.trim() || null,
    nav_order: parseOptionalNumber(form.nav_order),
    nav_section_order: parseOptionalNumber(form.nav_section_order),
    featured_order: parseOptionalNumber(form.featured_order),
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

function parseOptionalNumber(value: string | number) {
  const trimmed = String(value).trim()
  return trimmed ? Number(trimmed) : null
}

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
    form.nav_section = res.doc.nav_section ?? ''
    form.nav_title = res.doc.nav_title ?? ''
    form.nav_order = res.doc.nav_order != null ? String(res.doc.nav_order) : ''
    form.nav_section_order = res.doc.nav_section_order != null ? String(res.doc.nav_section_order) : ''
    form.hide_from_nav = Boolean(res.doc.hide_from_nav)
    form.featured_order = res.doc.featured_order != null ? String(res.doc.featured_order) : ''
    form.difficulty_level = res.doc.difficulty_level ?? ''
    form.seo_description = res.doc.seo_description ?? ''
    form.seo_keywords = res.doc.seo_keywords ?? ''
    form.canonical_url = res.doc.canonical_url ?? ''
    form.robots = res.doc.robots ?? ''
    form.body = res.doc.body
    form.featured_image_asset_id = res.doc.featured_image_asset_id ?? ''
    hydrateStructuredContent(res.doc.components)
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
      body: { ...buildPayload(), ...(publish ? { publish: true } : {}) },
    })
    if (!updated.doc) throw new Error('Doc not found after save')
    doc.value = updated.doc
    hydrateStructuredContent(updated.doc.components)
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
    const updated = await $fetch<DocResponse>(`/api/admin/docs/${docId}`, {
      method: 'PATCH',
      body: { ...buildPayload(), unpublish: true },
    })
    if (!updated.doc) throw new Error('Doc not found after unpublish')
    doc.value = updated.doc
    hydrateStructuredContent(updated.doc.components)
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

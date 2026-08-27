<template>
  <UDashboardPanel id="admin-docs-edit">
    <template #header>
      <UDashboardNavbar title="Edit Documentation">
        <template #leading>
          <DashboardNavbarLeading detail-to="/admin/docs" detail-label="Docs" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>

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
              placeholder="Select a category"
            />
          </UFormField>
          <UFormField label="Difficulty Level">
            <USelect
              v-model="form.difficulty_level"
              :items="difficultyItems"
              placeholder="Select difficulty"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 border-t border-default pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="Nav Section" hint="Optional">
            <USelect
              v-model="form.nav_section"
              :items="navSectionItems"
              placeholder="Use category default"
            />
          </UFormField>
          <UFormField label="Nav Title" hint="Optional">
            <UInput v-model="form.nav_title" placeholder="Short sidebar label" />
          </UFormField>
          <UFormField label="Nav Order" hint="Optional">
            <UInputNumber v-model="form.nav_order" :min="0" placeholder="10" class="w-full" />
          </UFormField>
          <UFormField label="Section Order" hint="Optional">
            <UInputNumber v-model="form.nav_section_order" :min="0" placeholder="20" class="w-full" />
          </UFormField>
          <UFormField label="Featured Order" hint="Optional">
            <UInputNumber v-model="form.featured_order" :min="0" placeholder="1" class="w-full" />
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
          <PlatformMediaPicker v-model="featuredAssetId" />
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
                  <USelect v-model="form.faq_status" :items="componentStatusItems" />
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
                  <USelect v-model="form.how_to_status" :items="componentStatusItems" />
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
          <UButton :loading="saving" :disabled="!canSave" @click="update">
            Save live changes
          </UButton>
          <UButton color="error" variant="ghost" :loading="saving" @click="remove">
            Delete
          </UButton>
        </div>
      </div>
    </UCard>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { categories, difficultyLevels } from '~/config/documentation'
import { getErrorMessage } from '~/utils/errors'
import { createEmptyFaqItem, createEmptyHowToStep, docFormContentBlocks, hydrateDocFormContent, useDocForm } from '~/composables/useDocForm'
import { PLATFORM_DOC_NAV_SECTION_LABELS } from '~/utils/platform-content-nav'
import { parseOptionalNumber } from '~/utils/optional-number'

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
  media?: Array<{ asset_id: string; slot: string }>
  content_blocks: import('~/lib/components/workspace/blog/types').BlogEditorBlock[]
  document_updated_at: string
}

interface DocResponse {
  doc?: Doc
}

const isDocResponse = (value: unknown): value is DocResponse =>
  isRecord(value)
  && isRecord(value.doc)
  && typeof value.doc.id === 'string'
  && typeof value.doc.title === 'string'
  && Array.isArray(value.doc.content_blocks)
  && typeof value.doc.document_updated_at === 'string'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const docId = route.params.docId as string

const { form, canSave, featuredAssetId } = useDocForm()
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

function buildPayload() {
  const { body: _body, faq_items: _faqItems, faq_label: _faqLabel, faq_status: _faqStatus, faq_render_enabled: _faqRender, faq_schema_enabled: _faqSchema, how_to_steps: _howToSteps, how_to_label: _howToLabel, how_to_status: _howToStatus, how_to_render_enabled: _howToRender, how_to_schema_enabled: _howToSchema, ...fields } = form
  return {
    ...fields,
    content_blocks: docFormContentBlocks(form),
    expected_document_updated_at: doc.value?.document_updated_at,
    canonical_url: form.canonical_url.trim() || null,
    robots: form.robots.trim() || null,
    nav_section: form.nav_section.trim() || null,
    nav_title: form.nav_title.trim() || null,
    nav_order: parseOptionalNumber(form.nav_order),
    nav_section_order: parseOptionalNumber(form.nav_section_order),
    featured_order: parseOptionalNumber(form.featured_order),
  }
}

async function loadDoc() {
  loadPending.value = true
  loadError.value = ''
  try {
    const res = await applicationFetch<DocResponse>(`/api/admin/docs/${docId}`, {
      validate: isDocResponse,
    })
    if (!res.doc) throw new Error('Doc not found')
    doc.value = res.doc
    form.title = res.doc.title
    form.excerpt = res.doc.excerpt ?? ''
    form.category = res.doc.category ?? ''
    form.nav_section = res.doc.nav_section ?? ''
    form.nav_title = res.doc.nav_title ?? ''
    form.nav_order = res.doc.nav_order ?? null
    form.nav_section_order = res.doc.nav_section_order ?? null
    form.hide_from_nav = Boolean(res.doc.hide_from_nav)
    form.featured_order = res.doc.featured_order ?? null
    form.difficulty_level = res.doc.difficulty_level ?? ''
    form.seo_description = res.doc.seo_description ?? ''
    form.seo_keywords = res.doc.seo_keywords ?? ''
    form.canonical_url = res.doc.canonical_url ?? ''
    form.robots = res.doc.robots ?? ''
    hydrateDocFormContent(form, res.doc.content_blocks)
    form.media = res.doc.media ?? []
  } catch (err) {
    loadError.value = getErrorMessage(err, 'Failed to load doc.')
  } finally {
    loadPending.value = false
  }
}

async function update() {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await applicationFetch<DocResponse>(`/api/admin/docs/${docId}`, {
      method: 'PATCH',
      body: buildPayload(),
      validate: isDocResponse,
    })
    if (!updated.doc) throw new Error('Doc not found after save')
    doc.value = updated.doc
    hydrateDocFormContent(form, updated.doc.content_blocks)
    successMessage.value = 'Live changes saved.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete this doc permanently?')) return
  saving.value = true
  errorMessage.value = ''
  try {
    await applicationFetch(`/api/admin/docs/${docId}`, {
      method: 'DELETE',
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    await navigateTo('/admin/docs')
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to delete.')
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'Edit Documentation | Admin' })
</script>

<template>
  <div class="min-h-full bg-[#fbfbfa] pb-28 dark:bg-[#090b12]">
    <div class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside
        class="border-default px-5 py-7 sm:px-8 lg:block lg:border-r lg:px-6 lg:py-9"
        :class="mobileWorkspace ? 'hidden' : 'block'"
      >
        <div class="mx-auto max-w-xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-muted">Page outline</p>
              <h1 class="mt-1 text-2xl font-bold tracking-tight text-highlighted">{{ pageTitle }}</h1>
            </div>
            <span class="mt-1 shrink-0 text-xs font-medium" :class="localDirty ? 'text-warning' : 'text-success'">
              {{ localDirty ? 'Unsaved' : 'Saved' }}
            </span>
          </div>

          <button
            type="button"
            class="mt-7 w-full rounded-2xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="activeId === 'details'
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'border-default/70 bg-transparent hover:border-accented'"
            @click="select('details')"
          >
            <span class="block text-xs font-semibold text-muted">Page details</span>
            <span class="mt-3 block truncate text-lg font-semibold text-highlighted">{{ pageTitle }}</span>
            <span class="mt-1 block truncate text-sm text-muted">{{ page.path }} · {{ page.locale.toUpperCase() }}</span>
          </button>

          <div class="mt-7 space-y-4">
            <PrototypeSectionPreviewCard
              v-for="section in page.sections"
              :key="section.id"
              :section="previewSection(section)"
              :selected="activeId === section.id"
              @select="select(section.id)"
            />
          </div>

          <button type="button" class="mt-6 text-sm font-semibold text-primary">Add section</button>
        </div>
      </aside>

      <main
        class="min-w-0 px-5 py-7 sm:px-10 sm:py-10 lg:block lg:px-14 lg:py-12"
        :class="mobileWorkspace ? 'block' : 'hidden'"
      >
        <div class="mx-auto max-w-3xl">
          <button type="button" class="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-muted lg:hidden" @click="mobileWorkspace = false">
            <UIcon name="i-lucide-arrow-left" class="size-4" />
            Page outline
          </button>

          <template v-if="activeId === 'details'">
            <div class="flex items-start justify-between gap-6">
              <div>
                <p class="text-sm font-semibold text-muted">Page</p>
                <h2 class="mt-1 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Page details</h2>
              </div>
              <UButton class="hidden lg:inline-flex" label="Save" @click="markSaved" />
            </div>

            <div class="mt-10 hidden lg:block">
              <PrototypeDirectField
                v-for="field in pageFields"
                :key="field.key"
                :field="field"
                @input="updateField"
              />
            </div>

            <PrototypeMobileFieldList class="mt-9 lg:hidden" :fields="pageFields" @edit="openEditor" />
          </template>

          <template v-else-if="activeSection">
            <div class="flex items-start justify-between gap-6">
              <div>
                <p class="text-sm font-semibold text-muted">{{ activeSection.label }}</p>
                <h2 class="mt-1 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">{{ sectionHeading(activeSection) }}</h2>
              </div>
              <UButton class="hidden lg:inline-flex" label="Save" @click="markSaved" />
            </div>

            <img
              v-if="activeSection.mediaUrl"
              :src="activeSection.mediaUrl"
              :alt="activeSection.mediaAlt"
              class="mt-9 aspect-[16/8] w-full rounded-xl object-cover"
            />

            <div class="mt-10 hidden lg:block">
              <PrototypeDirectField
                v-for="field in sectionFields"
                :key="field.key"
                :field="field"
                @input="updateField"
              />
            </div>

            <PrototypeMobileFieldList class="mt-9 lg:hidden" :fields="sectionFields" @edit="openEditor" />
          </template>
        </div>
      </main>
    </div>

    <Teleport to="body">
      <div v-if="editingField" class="fixed inset-0 z-[60] lg:hidden" @keydown.esc="closeEditor">
        <button type="button" class="absolute inset-0 bg-black/45" aria-label="Close editor" @click="closeEditor" />
        <section
          role="dialog"
          aria-modal="true"
          :aria-labelledby="editorTitleId"
          class="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-[1.75rem] bg-[#fbfbfa] shadow-2xl dark:bg-[#090b12]"
        >
          <div class="mx-auto mt-3 h-1 w-10 rounded-full bg-accented" />
          <header class="flex h-16 shrink-0 items-center justify-between border-b border-default px-5">
            <h2 :id="editorTitleId" class="text-lg font-semibold text-highlighted">Edit {{ editingField.label.toLowerCase() }}</h2>
            <button type="button" class="grid size-9 place-items-center rounded-full text-muted hover:bg-muted" aria-label="Close editor" @click="closeEditor">
              <UIcon name="i-lucide-x" class="size-5" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-7">
            <label class="block border-b border-accented pb-3 focus-within:border-primary">
              <span class="mb-2 block text-sm font-semibold text-highlighted">{{ editingField.label }}</span>
              <textarea
                v-if="editingField.kind === 'textarea'"
                ref="editorInput"
                v-model="draftValue"
                rows="7"
                class="w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-highlighted outline-none"
              />
              <input
                v-else
                ref="editorInput"
                v-model="draftValue"
                type="text"
                class="h-10 w-full border-0 bg-transparent p-0 text-base text-highlighted outline-none"
              />
            </label>
          </div>

          <footer class="flex shrink-0 items-center justify-end gap-3 border-t border-default px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="closeEditor" />
            <UButton label="Save" @click="saveEditor" />
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import PrototypeDirectField from './PrototypeDirectField.vue'
import PrototypeMobileFieldList from './PrototypeMobileFieldList.vue'
import PrototypeSectionPreviewCard from './PrototypeSectionPreviewCard.vue'
import type { PrototypeEditorField, PrototypeEditorKind, PrototypePageView, PrototypeSection } from './prototype-model'

const props = defineProps<{ page: PrototypePageView }>()
const activeId = ref('details')
const mobileWorkspace = ref(false)
const editingField = ref<PrototypeEditorField | null>(null)
const draftValue = ref('')
const editorInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const localValues = reactive<Record<string, string>>({})
const localDirty = ref(props.page.dirty)
const editorTitleId = 'cms-prototype-field-editor-title'

const pageTitle = computed(() => valueFor('page-title', props.page.title))
const activeSection = computed(() => props.page.sections.find(section => section.id === activeId.value) ?? null)

const pageFields = computed<PrototypeEditorField[]>(() => [
  field('page-title', 'Title', props.page.title),
  field('page-summary', 'Description', props.page.summary, 'textarea'),
  field('page-path', 'URL', props.page.path),
  field('page-language', 'Language', props.page.locale.toUpperCase(), 'readonly'),
])

const sectionFields = computed<PrototypeEditorField[]>(() => {
  const section = activeSection.value
  if (!section) return []
  if (section.type === 'hero') {
    return [
      field(`${section.id}-heading`, 'Heading', section.summary),
      field(`${section.id}-content`, 'Supporting text', section.body, 'textarea'),
      field(`${section.id}-media`, 'Media', section.mediaUrl ? 'Selected' : 'Not set', 'readonly'),
    ]
  }
  if (['cta', 'contact_cta', 'booking_cta', 'donation_choices', 'button_group'].includes(section.type)) {
    return [
      field(`${section.id}-heading`, 'Button text', section.summary),
      field(`${section.id}-content`, 'Supporting text', section.body === section.summary ? '' : section.body, 'textarea'),
    ]
  }
  if (['image', 'gallery'].includes(section.type)) {
    return [
      field(`${section.id}-alt`, 'Alt text', section.mediaAlt),
      field(`${section.id}-media`, 'Media', section.mediaUrl ? 'Selected' : 'Not set', 'readonly'),
    ]
  }
  if (['markdown', 'heading', 'callout', 'faq', 'testimonial_grid'].includes(section.type)) {
    return [field(`${section.id}-content`, 'Content', section.body || section.summary, 'textarea')]
  }
  return [
    field(`${section.id}-heading`, 'Heading', section.summary),
    field(`${section.id}-content`, 'Content', section.body, 'textarea'),
  ]
})

function valueFor(key: string, fallback: string): string {
  return key in localValues ? localValues[key]! : fallback
}

function field(key: string, label: string, fallback: string, kind: PrototypeEditorKind = 'text'): PrototypeEditorField {
  return { key, label, value: valueFor(key, fallback), kind }
}

function sectionHeading(section: PrototypeSection): string {
  return valueFor(`${section.id}-heading`, section.summary)
}

function previewSection(section: PrototypeSection): PrototypeSection {
  const content = valueFor(`${section.id}-content`, section.body)
  const heading = valueFor(`${section.id}-heading`, section.summary)
  const mediaAlt = valueFor(`${section.id}-alt`, section.mediaAlt)

  if (section.type === 'heading') return { ...section, summary: content, body: content, mediaAlt }
  if (['markdown', 'callout', 'faq', 'testimonial_grid'].includes(section.type)) {
    return { ...section, body: content, mediaAlt }
  }
  return { ...section, summary: heading, body: content, mediaAlt }
}

function select(id: string) {
  activeId.value = id
  mobileWorkspace.value = true
}

function updateField(key: string, value: string) {
  localValues[key] = value
  localDirty.value = true
}

function openEditor(fieldToEdit: PrototypeEditorField) {
  if (fieldToEdit.kind === 'readonly') return
  editingField.value = fieldToEdit
  draftValue.value = fieldToEdit.value
  void nextTick(() => editorInput.value?.focus())
}

function closeEditor() {
  editingField.value = null
}

function saveEditor() {
  if (!editingField.value) return
  updateField(editingField.value.key, draftValue.value)
  closeEditor()
}

function markSaved() {
  localDirty.value = false
}
</script>

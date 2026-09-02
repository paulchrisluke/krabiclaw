<template>
  <div class="min-h-full bg-default pb-28">
    <div class="mx-auto min-h-[calc(100vh-8rem)] max-w-3xl">
      <main class="px-5 py-7 sm:px-8 sm:py-10">
        <template v-if="screen === 'overview'">
          <div class="flex items-start justify-between gap-5">
            <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">{{ pageTitle }}</h1>
            <span class="mt-2 shrink-0 text-xs font-medium" :class="page.dirty ? 'text-warning' : 'text-success'">
              {{ page.dirty ? 'Unsaved' : 'Saved' }}
            </span>
          </div>

          <section class="mt-8">
            <button
              type="button"
              class="flex w-full items-center gap-4 border-y border-default py-5 text-left transition hover:bg-muted/40"
              @click="screen = 'details'"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-highlighted">Page details</span>
                <span class="mt-1 block truncate text-sm text-muted">{{ pageSummary || 'No description' }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </button>
          </section>

          <section class="mt-9">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold text-highlighted">Sections</h2>
              <span class="text-xs text-muted">{{ page.sections.length }}</span>
            </div>
            <div class="divide-y divide-default border-y border-default">
              <button
                v-for="(section, index) in page.sections"
                :key="section.id"
                type="button"
                class="flex w-full items-center gap-4 py-5 text-left transition hover:bg-muted/40"
                @click="showSection(section.id)"
              >
                <span class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-xs font-medium text-dimmed">
                  <img v-if="section.mediaUrl" :src="section.mediaUrl" :alt="section.mediaAlt" class="size-full object-cover" />
                  <span v-else>{{ String(index + 1).padStart(2, '0') }}</span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold text-highlighted">{{ section.label }}</span>
                  <span class="mt-1 block truncate text-sm text-muted">{{ sectionHeading(section) }}</span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
              </button>
            </div>
            <button type="button" class="mt-5 text-sm font-semibold text-primary">Add section</button>
          </section>
        </template>

        <template v-else-if="screen === 'details'">
          <button type="button" class="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-highlighted" @click="showOverview">
            <UIcon name="i-lucide-arrow-left" class="size-4" />
            {{ pageTitle }}
          </button>
          <h1 class="mt-6 text-3xl font-bold tracking-tight text-highlighted">Page details</h1>

          <dl class="mt-8 divide-y divide-default border-y border-default">
            <div v-for="field in pageFields" :key="field.key" class="flex items-center gap-4 py-5">
              <div class="min-w-0 flex-1">
                <dt class="text-sm text-muted">{{ field.label }}</dt>
                <dd class="mt-1 truncate font-medium text-highlighted">{{ field.value || 'Not set' }}</dd>
              </div>
              <button
                v-if="field.editable"
                type="button"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                :aria-label="`Edit ${field.label.toLowerCase()}`"
                @click="openEditor(field)"
              >
                Edit
                <UIcon name="i-lucide-chevron-right" class="size-4" />
              </button>
            </div>
          </dl>
        </template>

        <template v-else-if="activeSection">
          <button type="button" class="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-highlighted" @click="showOverview">
            <UIcon name="i-lucide-arrow-left" class="size-4" />
            {{ pageTitle }}
          </button>
          <h1 class="mt-6 text-3xl font-bold tracking-tight text-highlighted">{{ activeSection.label }}</h1>

          <img
            v-if="activeSection.mediaUrl"
            :src="activeSection.mediaUrl"
            :alt="activeSection.mediaAlt"
            class="mt-7 aspect-[16/8] w-full rounded-xl object-cover"
          />

          <dl class="mt-8 divide-y divide-default border-y border-default">
            <div v-for="field in sectionFields" :key="field.key" class="flex items-center gap-4 py-5">
              <div class="min-w-0 flex-1">
                <dt class="text-sm text-muted">{{ field.label }}</dt>
                <dd class="mt-1 line-clamp-2 font-medium text-highlighted">{{ field.value || 'Not set' }}</dd>
              </div>
              <button
                v-if="field.editable"
                type="button"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                :aria-label="`Edit ${field.label.toLowerCase()}`"
                @click="openEditor(field)"
              >
                Edit
                <UIcon name="i-lucide-chevron-right" class="size-4" />
              </button>
            </div>
          </dl>
        </template>
      </main>
    </div>

    <Teleport to="body">
      <div v-if="editingField" class="fixed inset-0 z-[60]" @keydown.esc="closeEditor">
        <button type="button" class="absolute inset-0 bg-black/45" aria-label="Close editor" @click="closeEditor" />
        <section
          role="dialog"
          aria-modal="true"
          :aria-labelledby="editorTitleId"
          class="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-[1.75rem] bg-default shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[28rem] sm:rounded-none"
        >
          <div class="mx-auto mt-3 h-1 w-10 rounded-full bg-accented sm:hidden" />
          <header class="flex h-16 shrink-0 items-center justify-between border-b border-default px-5 sm:px-6">
            <h2 :id="editorTitleId" class="text-lg font-semibold text-highlighted">Edit {{ editingField.label.toLowerCase() }}</h2>
            <button type="button" class="grid size-9 place-items-center rounded-full text-muted hover:bg-muted" aria-label="Close editor" @click="closeEditor">
              <UIcon name="i-lucide-x" class="size-5" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-highlighted">{{ editingField.label }}</span>
              <textarea
                v-if="editingField.kind === 'textarea'"
                ref="editorInput"
                v-model="draftValue"
                rows="8"
                class="w-full resize-none rounded-xl border border-default bg-elevated p-4 text-base leading-7 text-highlighted outline-none focus:border-primary"
              />
              <input
                v-else
                ref="editorInput"
                v-model="draftValue"
                type="text"
                class="h-12 w-full rounded-xl border border-default bg-elevated px-4 text-base text-highlighted outline-none focus:border-primary"
              />
            </label>
          </div>

          <footer class="flex shrink-0 items-center justify-end gap-3 border-t border-default px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
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
import type { PrototypePageView, PrototypeSection } from './prototype-model'

type PrototypeScreen = 'overview' | 'details' | 'section'
type EditorKind = 'text' | 'textarea'

interface PrototypeField {
  key: string
  label: string
  value: string
  kind: EditorKind
  editable: boolean
}

const props = defineProps<{ page: PrototypePageView }>()
const screen = ref<PrototypeScreen>('overview')
const activeSectionId = ref<string | null>(null)
const editingField = ref<PrototypeField | null>(null)
const draftValue = ref('')
const editorInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const localValues = reactive<Record<string, string>>({})
const editorTitleId = 'cms-prototype-field-editor-title'

const pageTitle = computed(() => valueFor('page-title', props.page.title))
const pageSummary = computed(() => valueFor('page-summary', props.page.summary))
const activeSection = computed(() => props.page.sections.find(section => section.id === activeSectionId.value) ?? null)

const pageFields = computed<PrototypeField[]>(() => [
  field('page-title', 'Title', props.page.title, 'text'),
  field('page-summary', 'Description', props.page.summary, 'textarea'),
  field('page-path', 'URL', props.page.path, 'text'),
  { key: 'page-language', label: 'Language', value: props.page.locale.toUpperCase(), kind: 'text', editable: false },
])

const sectionFields = computed<PrototypeField[]>(() => {
  const section = activeSection.value
  if (!section) return []
  return [
    field(`${section.id}-heading`, 'Heading', sectionHeading(section), 'text'),
    field(`${section.id}-content`, 'Content', section.body, 'textarea'),
    {
      key: `${section.id}-media`,
      label: 'Media',
      value: section.mediaUrl ? 'Selected' : 'Not set',
      kind: 'text',
      editable: false,
    },
  ]
})

function valueFor(key: string, fallback: string): string {
  return key in localValues ? localValues[key]! : fallback
}

function field(key: string, label: string, fallback: string, kind: EditorKind): PrototypeField {
  return { key, label, value: valueFor(key, fallback), kind, editable: true }
}

function sectionHeading(section: PrototypeSection): string {
  return valueFor(`${section.id}-heading`, section.summary)
}

function showOverview() {
  screen.value = 'overview'
  activeSectionId.value = null
}

function showSection(sectionId: string) {
  activeSectionId.value = sectionId
  screen.value = 'section'
}

function openEditor(fieldToEdit: PrototypeField) {
  editingField.value = fieldToEdit
  draftValue.value = fieldToEdit.value
  void nextTick(() => editorInput.value?.focus())
}

function closeEditor() {
  editingField.value = null
}

function saveEditor() {
  if (!editingField.value) return
  localValues[editingField.value.key] = draftValue.value
  closeEditor()
}
</script>

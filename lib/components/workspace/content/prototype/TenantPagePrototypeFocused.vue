<template>
  <UDashboardSidebar
    id="tenant-page-prototype-outline"
    resizable
    :default-size="28"
    :min-size="23"
    :max-size="34"
    class="hidden bg-[#fbfbfa] lg:flex dark:bg-[#090b12]"
    :ui="{
      root: 'h-full !min-h-0 max-h-full border-r border-default bg-[#fbfbfa] dark:bg-[#090b12]',
      header: 'h-auto min-h-20 border-b border-default px-5 py-4',
      body: 'min-h-0 overflow-y-auto px-5 py-6',
      footer: 'border-t border-default px-5 py-4',
      content: 'bg-[#fbfbfa] dark:bg-[#090b12]',
    }"
  >
    <template #header>
      <div class="flex w-full items-center gap-3">
        <UButton :to="backTo" icon="i-lucide-arrow-left" color="neutral" variant="soft" square aria-label="Back to pages" class="rounded-full" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-muted">Website</p>
          <h1 class="truncate text-xl font-bold tracking-tight text-highlighted">Page editor</h1>
        </div>
        <UButton :to="siteSettingsTo" icon="i-lucide-settings" color="neutral" variant="ghost" square aria-label="Website settings" />
      </div>
    </template>

    <PrototypePageOutline :page="outlinePage" :selected-id="activeId" :dirty="localDirty" @select="select" />

    <template #footer>
      <UButton :to="previewTo" target="_blank" icon="i-lucide-eye" label="Preview page" color="neutral" variant="solid" :disabled="!previewTo" block />
    </template>
  </UDashboardSidebar>

  <UDashboardPanel
    id="tenant-page-prototype-read-view"
    class="min-w-0 bg-[#fbfbfa] dark:bg-[#090b12]"
    :ui="{ root: 'h-full !min-h-0', body: 'min-h-0 overflow-y-auto p-0' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="mobileWorkspace ? activeReadTitle : 'Page editor'"
        :toggle="false"
        class="bg-[#fbfbfa] lg:hidden dark:bg-[#090b12]"
        :ui="{ root: 'border-b border-default' }"
      >
        <template #leading>
          <UButton
            v-if="mobileWorkspace"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            square
            aria-label="Back to page editor"
            @click="mobileWorkspace = false"
          />
          <UButton v-else :to="backTo" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="Back to pages" />
        </template>
        <template #right>
          <UButton v-if="!mobileWorkspace" :to="siteSettingsTo" icon="i-lucide-settings" color="neutral" variant="ghost" square aria-label="Website settings" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <section v-if="!mobileWorkspace" class="mx-auto max-w-xl px-5 pb-28 pt-7 lg:hidden">
        <PrototypePageOutline :page="outlinePage" :selected-id="activeId" :dirty="localDirty" @select="select" />
      </section>

      <main
        class="min-h-full px-5 pb-28 pt-7 sm:px-10 sm:pt-10 lg:px-16 lg:pb-16 lg:pt-14"
        :class="mobileWorkspace ? 'block' : 'hidden lg:block'"
      >
        <div class="mx-auto max-w-3xl">
          <template v-if="activeId === 'details'">
            <p class="text-sm font-semibold text-muted">Page</p>
            <h2 class="mt-1 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">Page details</h2>
            <PrototypeFieldReadList class="mt-9" :fields="pageFields" @edit="openEditor" />
          </template>

          <template v-else-if="activeSection">
            <p class="text-sm font-semibold text-muted">{{ activeSection.label }}</p>
            <h2 class="mt-1 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">{{ sectionHeading(activeSection) }}</h2>

            <img
              v-if="activeSection.mediaUrl"
              :src="activeSection.mediaUrl"
              :alt="activeSection.mediaAlt"
              class="mt-9 aspect-[16/8] w-full rounded-xl object-cover"
            >

            <PrototypeFieldReadList class="mt-9" :fields="sectionFields" @edit="openEditor" />
          </template>
        </div>
      </main>
    </template>
  </UDashboardPanel>

  <Teleport to="body">
    <div v-if="editingField" class="fixed inset-0 z-[60]" @keydown.esc="closeEditor">
      <button type="button" class="absolute inset-0 bg-black/45" aria-label="Close editor" @click="closeEditor" />
      <section
        role="dialog"
        aria-modal="true"
        :aria-labelledby="editorTitleId"
        class="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-[1.75rem] bg-[#fbfbfa] shadow-2xl lg:inset-y-0 lg:left-auto lg:w-[30rem] lg:max-h-none lg:rounded-none dark:bg-[#090b12]"
      >
        <div class="mx-auto mt-3 h-1 w-10 rounded-full bg-accented lg:hidden" />
        <header class="flex h-16 shrink-0 items-center justify-between border-b border-default px-5 lg:px-6">
          <h2 :id="editorTitleId" class="text-lg font-semibold text-highlighted">Edit {{ editingField.label.toLowerCase() }}</h2>
          <button type="button" class="grid size-9 place-items-center rounded-full text-muted hover:bg-muted" aria-label="Close editor" @click="closeEditor">
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-7 lg:px-6">
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
            >
          </label>
        </div>

        <footer class="flex shrink-0 items-center justify-end gap-3 border-t border-default px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:px-6 lg:pb-4">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="closeEditor" />
          <UButton label="Save" @click="saveEditor" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import PrototypeFieldReadList from './PrototypeFieldReadList.vue'
import PrototypePageOutline from './PrototypePageOutline.vue'
import type { PrototypeEditorField, PrototypeEditorKind, PrototypePageView, PrototypeSection } from './prototype-model'

const props = defineProps<{
  page: PrototypePageView
  backTo: string
  previewTo?: string
}>()

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
const activeReadTitle = computed(() => activeId.value === 'details' ? 'Page details' : activeSection.value?.label ?? 'Page editor')
const siteSettingsTo = computed(() => props.backTo.endsWith('/pages') ? `${props.backTo.slice(0, -6)}/settings` : props.backTo)
const outlinePage = computed<PrototypePageView>(() => ({
  ...props.page,
  title: pageTitle.value,
  dirty: localDirty.value,
  sections: props.page.sections.map(previewSection),
}))

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
</script>

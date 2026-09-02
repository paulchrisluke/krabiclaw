<template>
  <UDashboardSidebar
    id="tenant-page-prototype-outline"
    resizable
    :default-size="30"
    :min-size="27"
    :max-size="34"
    class="hidden bg-[#fbfbfa] lg:flex dark:bg-[#090b12]"
    :ui="{
      root: 'h-full !min-h-0 max-h-full border-r border-default bg-[#fbfbfa] dark:bg-[#090b12]',
      header: 'h-auto min-h-24 border-b border-default px-6 py-5',
      body: 'min-h-0 overflow-y-auto px-6 py-8',
      footer: 'border-t border-default px-6 py-4',
      content: 'bg-[#fbfbfa] dark:bg-[#090b12]',
    }"
  >
    <template #header>
      <div class="mx-auto flex w-full max-w-sm items-center gap-4">
        <UButton :to="backTo" icon="i-lucide-arrow-left" color="neutral" variant="soft" square aria-label="Back to pages" class="rounded-full" />
        <h1 class="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-highlighted">Page editor</h1>
        <UButton :to="siteSettingsTo" icon="i-lucide-settings" color="neutral" variant="ghost" square aria-label="Website settings" />
      </div>
    </template>

    <PrototypePageOutline :page="outlinePage" :selected-id="activeId" @select="select" />

    <template #footer>
      <div class="flex w-full justify-center">
        <UButton :to="previewTo" target="_blank" icon="i-lucide-eye" label="Preview page" color="neutral" variant="solid" :disabled="!previewTo" class="min-w-44 justify-center rounded-full" />
      </div>
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
            @click="returnToOutline"
          />
          <UButton v-else :to="backTo" icon="i-lucide-arrow-left" color="neutral" variant="ghost" square aria-label="Back to pages" />
        </template>
        <template #right>
          <UButton v-if="!mobileWorkspace" :to="siteSettingsTo" icon="i-lucide-settings" color="neutral" variant="ghost" square aria-label="Website settings" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <section v-if="!mobileWorkspace" class="mx-auto max-w-xl px-5 pb-28 pt-6 lg:hidden">
        <PrototypePageOutline :page="outlinePage" selected-id="" @select="select" />
      </section>

      <main
        class="min-h-full px-5 pb-28 pt-3 sm:px-10 lg:px-16 lg:pb-16 lg:pt-1"
        :class="mobileWorkspace ? 'block' : 'hidden lg:block'"
      >
        <div class="mx-auto max-w-xl">
          <template v-if="activeId === 'details'">
            <h2 class="hidden text-4xl font-bold tracking-tight text-highlighted lg:block">Page details</h2>
            <PrototypeFieldReadList class="lg:mt-10" :fields="pageFields" @edit="openEditor" />
          </template>

          <template v-else-if="activeSection">
            <h2 class="hidden text-4xl font-bold tracking-tight text-highlighted lg:block">{{ activeSection.label }}</h2>

            <img
              v-if="activeSection.mediaUrl"
              :src="activeSection.mediaUrl"
              :alt="activeSection.mediaAlt"
              class="mb-6 aspect-[16/8] w-full rounded-2xl object-cover lg:mb-0 lg:mt-10"
            >

            <PrototypeFieldReadList :class="activeSection.mediaUrl ? 'lg:mt-8' : 'lg:mt-10'" :fields="sectionFields" @edit="openEditor" />
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
          <h2 :id="editorTitleId" class="text-lg font-semibold text-highlighted">{{ editingField.label }}</h2>
          <button type="button" class="grid size-9 place-items-center rounded-full text-muted hover:bg-muted" aria-label="Close editor" @click="closeEditor">
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-7 lg:px-6">
          <div class="border-b border-accented pb-3 focus-within:border-primary">
            <textarea
              v-if="editingField.kind === 'textarea'"
              ref="editorInput"
              v-model="draftValue"
              :aria-label="editingField.label"
              rows="7"
              class="w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-highlighted outline-none"
            />
            <input
              v-else
              ref="editorInput"
              v-model="draftValue"
              type="text"
              :aria-label="editingField.label"
              class="h-10 w-full border-0 bg-transparent p-0 text-base text-highlighted outline-none"
            >
          </div>
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
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { LocationQueryRaw } from 'vue-router'
import PrototypeFieldReadList from './PrototypeFieldReadList.vue'
import PrototypePageOutline from './PrototypePageOutline.vue'
import type { PrototypeEditorField, PrototypeEditorKind, PrototypePageView, PrototypeSection } from './prototype-model'

const props = defineProps<{
  page: PrototypePageView
  backTo: string
  previewTo?: string
}>()

const route = useRoute()
const router = useRouter()
const activeId = ref('details')
const mobileWorkspace = ref(false)
const editingField = ref<PrototypeEditorField | null>(null)
const draftValue = ref('')
const editorInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const localValues = reactive<Record<string, string>>({})
const editorTitleId = 'cms-prototype-field-editor-title'

const pageTitle = computed(() => valueFor('page-title', props.page.title))
const activeSection = computed(() => props.page.sections.find(section => section.id === activeId.value) ?? null)
const activeReadTitle = computed(() => activeId.value === 'details' ? 'Page details' : activeSection.value?.label ?? 'Page editor')
const siteSettingsTo = computed(() => props.backTo.endsWith('/pages') ? `${props.backTo.slice(0, -6)}/settings` : props.backTo)
const outlinePage = computed<PrototypePageView>(() => ({
  ...props.page,
  title: pageTitle.value,
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

watch(
  () => route.query.section,
  (section) => {
    const requestedId = typeof section === 'string' ? section : null
    const validRequestedId = requestedId !== null
      && (requestedId === 'details' || props.page.sections.some(item => item.id === requestedId))
    activeId.value = validRequestedId ? requestedId : 'details'
    mobileWorkspace.value = requestedId !== null
  },
  { immediate: true },
)

watch(
  [() => route.query.field, activeId],
  ([fieldKey]) => {
    if (typeof fieldKey !== 'string') {
      editingField.value = null
      return
    }
    const matchingField = [...pageFields.value, ...sectionFields.value].find(item => item.key === fieldKey)
    if (!matchingField || matchingField.kind === 'readonly') {
      editingField.value = null
      return
    }
    editingField.value = matchingField
    draftValue.value = matchingField.value
    void nextTick(() => editorInput.value?.focus())
  },
  { immediate: true },
)

function valueFor(key: string, fallback: string): string {
  return key in localValues ? localValues[key]! : fallback
}

function field(key: string, label: string, fallback: string, kind: PrototypeEditorKind = 'text'): PrototypeEditorField {
  return { key, label, value: valueFor(key, fallback), kind }
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
  const query: LocationQueryRaw = { ...route.query, section: id }
  delete query.field
  void router.push({ query })
}

function returnToOutline() {
  if (canReturnWithinEditor()) {
    router.back()
    return
  }
  const query: LocationQueryRaw = { ...route.query }
  delete query.section
  delete query.field
  void router.replace({ query })
}

function updateField(key: string, value: string) {
  localValues[key] = value
}

function openEditor(fieldToEdit: PrototypeEditorField) {
  if (fieldToEdit.kind === 'readonly') return
  void router.push({ query: { ...route.query, field: fieldToEdit.key } })
}

function closeEditor() {
  if (canReturnWithinEditor()) {
    router.back()
    return
  }
  const query: LocationQueryRaw = { ...route.query }
  delete query.field
  void router.replace({ query })
}

function canReturnWithinEditor(): boolean {
  if (!import.meta.client) return false
  const previousUrl = window.history.state?.back
  if (typeof previousUrl !== 'string') return false
  return new URL(previousUrl, window.location.href).pathname === route.path
}

function saveEditor() {
  if (!editingField.value) return
  updateField(editingField.value.key, draftValue.value)
  closeEditor()
}
</script>

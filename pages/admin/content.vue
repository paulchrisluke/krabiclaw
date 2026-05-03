<template>
  <!--
    Full-screen Shopify-style content editor.
    Layout: [Left sidebar] [Center iframe] [Right edit panel (slide-in)]
    Design matches existing admin design system: white cards, stone borders, rounded-3xl.
  -->
  <div class="flex h-screen bg-stone-50 overflow-hidden font-sans">

    <!-- ─── Left Sidebar ──────────────────────────────────────────────── -->
    <aside class="w-72 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col h-full overflow-hidden">

      <!-- Header -->
      <div class="px-5 py-4 border-b border-stone-100 flex-shrink-0">
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">Content Editor</p>
            <h1 class="text-sm font-bold text-gray-900 tracking-tight italic">KIKUZUKI Marketing Site</h1>
          </div>
          <NuxtLink to="/admin" class="text-xs text-stone-400 hover:text-stone-700 transition-colors font-medium">← Back</NuxtLink>
        </div>

        <!-- Page selector -->
        <div class="relative">
          <select
            id="content-page-selector"
            v-model="selectedPageId"
            class="w-full appearance-none bg-stone-50 border border-stone-200 text-gray-900 text-sm font-semibold px-3 pr-8 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 cursor-pointer transition-colors hover:border-stone-300"
            @change="onPageChange"
          >
            <option v-for="p in pages" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
          <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-[10px]">▾</span>
        </div>
      </div>

      <!-- Draft status -->
      <div class="px-5 py-2.5 border-b border-stone-100 flex-shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full flex-shrink-0 transition-colors"
            :class="{
              'bg-amber-400 animate-pulse': localHasChanges,
              'bg-emerald-400': !localHasChanges && serverHasDrafts,
              'bg-stone-300': !localHasChanges && !serverHasDrafts
            }"
          />
          <span class="text-xs text-stone-500 font-medium">
            <span v-if="localHasChanges">Unsaved changes</span>
            <span v-else-if="serverHasDrafts">Draft ready to publish</span>
            <span v-else>All published</span>
          </span>
        </div>
        <button
          v-if="localHasChanges || serverHasDrafts"
          class="text-xs text-stone-400 hover:text-red-500 transition-colors font-medium"
          @click="handleDiscard"
        >
          Discard
        </button>
      </div>

      <!-- Discard Confirmation Prompt -->
      <div v-if="discardPending" class="px-5 py-3 bg-red-50 border-b border-red-100 flex-shrink-0">
        <p class="text-xs text-red-700 font-medium mb-2">Discard all draft changes?</p>
        <div class="flex gap-2">
          <button @click="handleDiscard" class="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold">Yes, discard</button>
          <button @click="discardPending = false" class="text-xs text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-100">Cancel</button>
        </div>
      </div>

      <!-- Field groups list -->
      <div class="flex-1 overflow-y-auto py-2">

        <div v-for="group in currentPageGroups" :key="group.id" class="mb-0.5">
          <!-- Group toggle header -->
          <button
            class="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-stone-50 transition-colors"
            @click="toggleGroup(group.id)"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm">{{ group.icon }}</span>
              <span class="text-xs font-bold uppercase tracking-widest text-stone-500">{{ group.label }}</span>
            </div>
            <span
              class="text-stone-300 text-[10px] transition-transform duration-200"
              :class="{ 'rotate-180': openGroups.includes(group.id) }"
            >▾</span>
          </button>

          <!-- Fields -->
          <div v-if="openGroups.includes(group.id)" class="pb-1">
            <template v-for="fieldKey in group.fields" :key="fieldKey">
              <template v-if="getFieldDef(selectedPageId, fieldKey)">

                <!-- Google-managed field -->
                <div
                  v-if="getFieldDef(selectedPageId, fieldKey)?.source === 'google'"
                  class="mx-3 mb-0.5 px-3 py-2 rounded-xl flex items-center justify-between group/gf cursor-default"
                  :title="`This field is populated automatically from your Google Business Profile. Go to Connection to sync.`"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 mb-0.5">
                      <p class="text-xs font-semibold text-stone-500 truncate">{{ getFieldDef(selectedPageId, fieldKey)?.label }}</p>
                      <span class="flex-shrink-0 inline-flex items-center gap-1 bg-blue-50 text-blue-500 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-blue-100">
                        <span class="w-1 h-1 rounded-full bg-blue-400 animate-pulse inline-block" />
                        Google
                      </span>
                    </div>
                    <p class="text-[11px] text-stone-400 truncate">
                      {{ fieldPreview(fieldKey) }}
                    </p>
                  </div>
                  <NuxtLink
                    to="/admin/connection"
                    class="flex-shrink-0 ml-2 text-[10px] text-blue-500 hover:text-blue-700 font-bold opacity-0 group-hover/gf:opacity-100 transition-opacity"
                  >
                    Sync →
                  </NuxtLink>
                </div>

                <!-- Manual editable field -->
                <button
                  v-else
                  class="w-full mx-3 mb-0.5 px-3 py-2 rounded-xl text-left transition-all"
                  style="width: calc(100% - 24px);"
                  :class="
                    activeField === fieldKey
                      ? 'bg-black text-white'
                      : 'hover:bg-stone-50 text-gray-900'
                  "
                  @click="selectField(fieldKey)"
                >
                  <p class="text-xs font-semibold truncate" :class="activeField === fieldKey ? 'text-white' : 'text-stone-700'">
                    {{ getFieldDef(selectedPageId, fieldKey)?.label }}
                  </p>
                  <p class="text-[11px] mt-0.5 truncate" :class="activeField === fieldKey ? 'text-white/60' : 'text-stone-400'">
                    {{ fieldPreview(fieldKey) }}
                  </p>
                </button>

              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="px-4 py-4 border-t border-stone-100 flex-shrink-0 space-y-2">
        <button
          id="content-publish-btn"
          :disabled="publishing || (!localHasChanges && !serverHasDrafts)"
          class="w-full h-10 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:cursor-not-allowed border"
          :class="
            (localHasChanges || serverHasDrafts) && !publishing
              ? 'bg-black text-white hover:bg-stone-900 border-black'
              : 'bg-white text-stone-300 border-stone-200'
          "
          @click="handlePublish"
        >
          {{ publishing ? 'Publishing…' : 'Publish Live' }}
        </button>
      </div>
    </aside>

    <!-- ─── Center: iframe preview ────────────────────────────────────── -->
    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
      <!-- Minimal browser chrome bar -->
      <div class="h-10 bg-stone-100 border-b border-stone-200 flex items-center px-4 gap-3 flex-shrink-0">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div class="flex-1 flex justify-center">
          <div class="bg-white border border-stone-200 rounded-lg px-4 py-1 flex items-center gap-2 min-w-0 max-w-sm w-full">
            <span class="text-stone-300 text-xs">🔒</span>
            <span class="text-stone-500 text-xs truncate">kikuzuki-thailand.com{{ currentPagePath }}</span>
          </div>
        </div>
        <div class="w-16" /> <!-- spacer to centre the URL bar -->
      </div>

      <!-- Iframe -->
      <div class="flex-1 overflow-hidden relative bg-white">
        <iframe
          id="site-preview-frame"
          ref="previewFrame"
          :src="iframeSrc"
          class="w-full h-full border-0 transition-opacity duration-300"
          :class="{ 'opacity-40': iframeLoading }"
          @load="iframeLoading = false"
        />
        <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
          <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="flex flex-col items-center gap-3 bg-white/80 rounded-2xl px-8 py-6 shadow-sm border border-stone-200">
              <div class="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
              <p class="text-stone-400 text-xs font-medium">Loading preview…</p>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ─── Right: Field editor panel ────────────────────────────────── -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-full opacity-0"
    >
      <div
        v-if="activeField"
        class="w-80 flex-shrink-0 bg-white border-l border-stone-200 flex flex-col h-full overflow-hidden"
      >
        <!-- Panel header -->
        <div class="px-5 py-4 border-b border-stone-100 flex items-start justify-between flex-shrink-0">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-0.5">Editing</p>
            <h2 class="text-sm font-bold text-gray-900">{{ activeFieldDef?.label }}</h2>
            <p class="text-xs text-stone-400 mt-0.5">{{ selectedPageLabel }} → {{ activeFieldDef?.label }}</p>
          </div>
          <button
            class="mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-all text-sm"
            @click="activeField = null"
          >
            ✕
          </button>
        </div>

        <!-- Panel body -->
        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Text input -->
          <div v-if="activeFieldDef?.type === 'text'" class="space-y-2">
            <label class="block text-xs font-bold text-stone-500 uppercase tracking-widest">{{ activeFieldDef.label }}</label>
            <input
              v-model="editingValue"
              type="text"
              class="w-full bg-stone-50 border border-stone-200 text-gray-900 text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 placeholder-stone-300 transition-colors"
              :placeholder="activeFieldDef?.placeholder || activeFieldDef?.defaultValue || 'Enter value…'"
            />
            <p v-if="activeFieldDef?.defaultValue" class="text-xs text-stone-300 italic">Default: {{ activeFieldDef.defaultValue }}</p>
          </div>

          <!-- Richtext input -->
          <div v-else-if="activeFieldDef?.type === 'richtext'" class="space-y-2">
            <label class="block text-xs font-bold text-stone-500 uppercase tracking-widest">{{ activeFieldDef.label }}</label>
            <!-- Format toolbar -->
            <div class="flex gap-1 flex-wrap">
              <button
                v-for="cmd in richtextCommands"
                :key="cmd.cmd"
                class="px-2 py-1 text-xs bg-stone-50 hover:bg-stone-100 text-stone-600 hover:text-stone-900 rounded-lg border border-stone-200 transition-colors font-medium"
                @mousedown.prevent="execCmd(cmd.cmd)"
              >{{ cmd.label }}</button>
            </div>
            <div
              id="richtext-editor"
              contenteditable="true"
              class="w-full min-h-[160px] bg-stone-50 border border-stone-200 text-gray-900 text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 prose prose-sm max-w-none"
              :data-placeholder="activeFieldDef?.placeholder || 'Start typing…'"
              v-html="editingValue || ''"
              @blur="onRichTextBlur"
            />
          </div>

          <!-- Apply -->
          <button
            id="field-apply-btn"
            :disabled="saving"
            class="w-full h-10 bg-black hover:bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            @click="applyField"
          >
            {{ saving ? 'Saving…' : 'Apply' }}
          </button>

          <!-- Current value preview -->
          <div v-if="currentValues[activeField]" class="border border-stone-100 rounded-xl p-4 bg-stone-50">
            <p class="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Current Value</p>
            <div
              v-if="activeFieldDef?.type === 'richtext'"
              v-html="currentValues[activeField]"
              class="text-xs text-stone-600 prose prose-sm max-w-none"
            />
            <p v-else class="text-xs text-stone-600">{{ currentValues[activeField] }}</p>
          </div>
          <div v-else class="border border-dashed border-stone-200 rounded-xl p-4">
            <p class="text-xs text-stone-400 italic text-center">No saved value yet — default will be shown on site</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <AppToast />
  </div>
</template>

<script setup lang="ts">
import { contentRegistry, editablePages, getFieldDef } from '~/config/content-registry'
import type { FieldDefinition } from '~/config/content-registry'

definePageMeta({ layout: false })

const { addToast } = useToast()

// ─── Pages ────────────────────────────────────────────────────────────
const pages = editablePages.map(p => ({
  id: p.path === '/' ? 'home' : p.path.replace(/^\//, '').replace(/\//g, '-'),
  label: p.label,
  path: p.path
}))

const selectedPageId = ref('home')
const currentPagePath = computed(() => pages.find(p => p.id === selectedPageId.value)?.path || '/')
const selectedPageLabel = computed(() => pages.find(p => p.id === selectedPageId.value)?.label || '')

// ─── Iframe ───────────────────────────────────────────────────────────
const previewFrame = ref<HTMLIFrameElement>()
const iframeLoading = ref(true)
// Use a key to force iframe reload when page changes
const iframeKey = ref(0)
const iframeSrc = ref('/')

const onPageChange = () => {
  iframeLoading.value = true
  activeField.value = null
  iframeSrc.value = currentPagePath.value
  loadPageContent()
}

watch(selectedPageId, () => {
  onPageChange()
})

// ─── Groups ───────────────────────────────────────────────────────────
const openGroups = ref<string[]>(['hero'])

const groupConfig: Record<string, Array<{ id: string; label: string; icon: string; fields: string[] }>> = {
  home: [
    { id: 'hero',   label: 'Hero Section',    icon: '🎯', fields: ['hero.title', 'hero.subtitle', 'hero.video'] },
    { id: 'cta',    label: 'Call to Action',  icon: '📣', fields: ['cta.title', 'cta.description'] },
    { id: 'google', label: 'Google Business', icon: '🔵', fields: ['business.name', 'business.establishment_year', 'business.description', 'business.address', 'business.phone', 'business.hours'] }
  ],
  about: [
    { id: 'hero',    label: 'Hero Section', icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'story',   label: 'Story',        icon: '📖', fields: ['story.intro', 'journey.title', 'journey.body', 'experience.body'] },
    { id: 'cuisine', label: 'Cuisine',      icon: '🍱', fields: ['grill.title', 'grill.description', 'sushi.title', 'sushi.description'] },
    { id: 'google',  label: 'Google Business', icon: '🔵', fields: ['business.establishment_year', 'business.description'] }
  ],
  contact: [
    { id: 'hero',    label: 'Hero Section',    icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Page Content',    icon: '📝', fields: ['intro.body'] },
    { id: 'social',  label: 'Social Links',    icon: '📱', fields: ['social.facebook', 'social.instagram'] },
    { id: 'google',  label: 'Google Business', icon: '🔵', fields: ['business.name', 'business.establishment_year', 'business.address', 'business.phone', 'business.hours'] }
  ],
  location: [
    { id: 'hero',    label: 'Hero Section',    icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Additional Info', icon: '📝', fields: ['parking.info', 'extra.notes'] },
    { id: 'google',  label: 'Google Business', icon: '🔵', fields: ['business.name', 'business.establishment_year', 'business.address', 'business.phone', 'business.hours'] }
  ],
  menu: [
    { id: 'hero',    label: 'Hero Section',      icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'content', label: 'Menu Introduction', icon: '📝', fields: ['description'] },
    { id: 'google',  label: 'Google Products',   icon: '🔵', fields: ['business.products'] }
  ],
  reservations: [
    { id: 'hero',     label: 'Hero Section',    icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
    { id: 'contact',  label: 'Contact Details', icon: '📞', fields: ['contact.phone', 'contact.email'] },
    { id: 'policies', label: 'Policies',        icon: '📋', fields: ['policies.body'] }
  ]
}

const currentPageGroups = computed(() => groupConfig[selectedPageId.value] || [])

const toggleGroup = (id: string) => {
  const idx = openGroups.value.indexOf(id)
  if (idx === -1) openGroups.value.push(id)
  else openGroups.value.splice(idx, 1)
}

// ─── Active field ─────────────────────────────────────────────────────
const activeField = ref<string | null>(null)
const editingValue = ref('')

const activeFieldDef = computed<FieldDefinition | undefined>(() =>
  activeField.value ? getFieldDef(selectedPageId.value, activeField.value) : undefined
)

const selectField = (key: string) => {
  activeField.value = key
  editingValue.value = currentValues.value[key] || ''
  
  // Find which group this field belongs to
  const group = currentPageGroups.value.find(g => g.fields.includes(key))
  if (group && previewFrame.value?.contentWindow) {
    previewFrame.value.contentWindow.postMessage({
      type: 'admin:focus',
      field: key,
      group: group.id
    }, '*')
  }
}

const onRichTextBlur = (e: FocusEvent) => {
  editingValue.value = (e.target as HTMLElement).innerHTML
}

const richtextCommands = [
  { cmd: 'bold',                label: 'B' },
  { cmd: 'italic',              label: 'I' },
  { cmd: 'insertUnorderedList', label: '• List' },
  { cmd: 'insertOrderedList',   label: '1. List' }
]
const execCmd = (cmd: string) => document.execCommand(cmd, false)

const applyField = async () => {
  if (!activeField.value) return
  
  // Handle regular content fields
  currentValues.value = { ...currentValues.value, [activeField.value]: editingValue.value }
  localHasChanges.value = true
  
  // Automatically save and refresh preview for immediate feedback
  await handleSaveDraft()
  addToast(`"${activeFieldDef.value?.label}" updated`, 'success')
}

// ─── Content state ────────────────────────────────────────────────────
const currentValues = ref<Record<string, string>>({})
const localHasChanges = ref(false)
const serverHasDrafts = ref(false)
const saving = ref(false)
const publishing = ref(false)
const discardPending = ref(false)

const loadPageContent = async () => {
  try {
    const res = await $fetch<{ content: any[]; hasDrafts: boolean }>(
      `/api/content/${selectedPageId.value}`
    )
    const map: Record<string, string> = {}
    for (const row of res.content || []) {
      if (row.field === 'hero' && !row.content) {
        if (row.hero_title)     map['hero.title']    = row.hero_title
        if (row.hero_subtitle)  map['hero.subtitle'] = row.hero_subtitle
        if (row.hero_video_url) map['hero.video']    = row.hero_video_url
        continue
      }
      map[row.field] = row.content || ''
    }
    currentValues.value = map
    serverHasDrafts.value = res.hasDrafts ?? false
  } catch { /* non-critical */ }
}

// Load on mount
onMounted(() => {
  loadPageContent()
  iframeSrc.value = currentPagePath.value
})

// ─── Actions ──────────────────────────────────────────────────────────
const handleSaveDraft = async () => {
  if (!localHasChanges.value) return
  saving.value = true
  try {
    await $fetch('/api/admin/content/draft', {
      method: 'POST',
      body: { path: currentPagePath.value, changes: currentValues.value },
      credentials: 'include'
    })
    localHasChanges.value = false
    serverHasDrafts.value = true
    
    // Send postMessage to iframe to refresh content instead of full reload
    if (previewFrame.value?.contentWindow) {
      previewFrame.value.contentWindow.postMessage({ type: 'admin:refresh-content' }, '*')
    }
  } catch (error: any) {
    const msg = error?.response?._data?.statusMessage || error.message || 'Unknown error'
    addToast(`Save failed: ${msg}`, 'error')
    throw error // Re-throw so callers like handlePublish know it failed
  } finally {
    saving.value = false
  }
}

const handlePublish = async () => {
  publishing.value = true
  try {
    if (localHasChanges.value) await handleSaveDraft()
    await $fetch('/api/admin/content/publish', {
      method: 'POST',
      body: { path: currentPagePath.value }
    })
    serverHasDrafts.value = false
    localHasChanges.value = false
    addToast('Published live!', 'success')
    iframeLoading.value = true
    iframeSrc.value = currentPagePath.value + '?t=' + Date.now()
  } catch (error: any) {
    const msg = error?.response?._data?.statusMessage || error.message || 'Unknown error'
    addToast(`Publish failed: ${msg}`, 'error')
  } finally {
    publishing.value = false
  }
}

const handleDiscard = async () => {
  if (!discardPending.value) {
    discardPending.value = true
    return
  }
  discardPending.value = false
  try {
    await $fetch('/api/admin/content/discard', {
      method: 'POST',
      body: { path: currentPagePath.value }
    })
    localHasChanges.value = false
    serverHasDrafts.value = false
    await loadPageContent()
    addToast('Drafts discarded', 'info')
    iframeLoading.value = true
    iframeSrc.value = currentPagePath.value + '?t=' + Date.now()
  } catch {
    addToast('Failed to discard', 'error')
  }
}

// ─── Utilities ────────────────────────────────────────────────────────
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

const fieldPreview = (fieldKey: string): string => {
  const raw = currentValues.value[fieldKey]
  if (!raw) return '— not set'
  const text = stripHtml(raw)
  return text.length > 48 ? text.substring(0, 45) + '…' : text || '— not set'
}

useSeoMeta({ title: 'Content Editor | KIKUZUKI Admin', robots: 'noindex, nofollow' })
</script>

<style scoped>
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: #a8a29e;
  font-style: italic;
  pointer-events: none;
}
</style>

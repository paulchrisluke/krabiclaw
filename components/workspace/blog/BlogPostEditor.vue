<template>
  <div class="fixed inset-0 z-50 flex min-h-0 flex-col bg-[#10131b] text-white">
    <header class="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#151923] px-2 pb-[env(safe-area-inset-top)] sm:px-4">
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" @click="goBack">Posts</UButton>
      <p class="min-w-0 flex-1 truncate text-xs text-gray-300 sm:text-sm">
        {{ statusLabel }} · <span :class="saveState === 'failed' || saveState === 'conflict' ? 'text-red-300' : ''">{{ saveLabel }}</span>
      </p>
      <UButton icon="i-lucide-share-2" color="neutral" variant="ghost" size="sm" aria-label="Share editor" @click="share"><span class="hidden sm:inline">Share</span></UButton>
      <UButton ref="settingsButton" icon="i-lucide-settings" color="neutral" variant="ghost" size="sm" aria-label="Post settings" @click="openSettings"><span class="hidden sm:inline">Settings</span></UButton>
      <UButton size="sm" :loading="publishing" :disabled="loadPending || saveState === 'conflict'" @click="publish">Publish</UButton>
    </header>

    <div v-if="loadPending" class="grid min-h-0 flex-1 place-items-center"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" /></div>
    <div v-else-if="loadError" class="grid min-h-0 flex-1 place-items-center p-6"><UAlert color="error" :description="loadError" /></div>
    <main v-else class="min-h-0 flex-1 overflow-y-auto bg-[var(--editor-canvas,#fff)] text-[var(--editor-ink,#1f2937)] [overscroll-behavior:contain]" :style="editorCanvasStyle">
      <BlogArticleRenderer
        v-model:title="form.title"
        :blocks="blocks"
        :template="templateName"
        editable
        @update:block="updateBlock"
      >
        <template #image-editor="{ block, index }">
          <component
            :is="mediaPickerComponent || PlatformMediaPicker"
            :site-id="siteId"
            :model-value="String(block.data.asset_id || '')"
            accept="image"
            @change="changeImage(index, $event)"
          />
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <UInput :model-value="String(block.data.alt || '')" placeholder="Alt text" @update:model-value="value => setBlockData(index, 'alt', value)" />
            <UInput :model-value="String(block.data.caption || '')" placeholder="Caption" @update:model-value="value => setBlockData(index, 'caption', value)" />
          </div>
        </template>
        <template #faq-editor="{ block, index }">
          <UTextarea :model-value="serializeFaq(block)" :rows="6" class="mt-3" aria-label="FAQ questions and answers" @update:model-value="value => parseFaq(index, String(value))" />
        </template>
        <template #how-to-editor="{ block, index }">
          <UTextarea :model-value="serializeHowTo(block)" :rows="5" class="mt-3" aria-label="How-To steps" @update:model-value="value => parseHowTo(index, String(value))" />
        </template>
        <template #block-actions="{ index }">
          <div class="absolute -right-3 top-0 flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <UButton icon="i-lucide-arrow-up" color="neutral" variant="soft" size="xs" :disabled="index === 0" aria-label="Move block up" @click="moveBlock(index, -1)" />
            <UButton icon="i-lucide-arrow-down" color="neutral" variant="soft" size="xs" :disabled="index === blocks.length - 1" aria-label="Move block down" @click="moveBlock(index, 1)" />
            <UButton icon="i-lucide-trash-2" color="neutral" variant="soft" size="xs" aria-label="Delete block" @click="removeBlock(index)" />
          </div>
        </template>
      </BlogArticleRenderer>

      <div class="sticky bottom-[calc(env(safe-area-inset-bottom)+1rem)] mx-auto mb-10 flex w-fit gap-1 rounded-full bg-[#151923] p-1.5 text-white shadow-xl">
        <UPopover v-model:open="inserterOpen">
          <UButton icon="i-lucide-plus" color="neutral" variant="ghost" aria-label="Insert block" />
          <template #content>
            <div class="grid w-44 p-1">
              <button v-for="item in inserterItems" :key="item.type" class="flex items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-elevated" @click="insertBlock(item.type)">
                <UIcon :name="item.icon" class="size-4" />{{ item.label }}
              </button>
            </div>
          </template>
        </UPopover>
      </div>
    </main>

    <div v-if="settingsOpen" class="fixed inset-0 z-40 bg-black/55" @click="closeSettings" />
    <aside v-if="settingsOpen" ref="settingsPanel" class="fixed inset-0 z-50 overflow-y-auto bg-[#171b25] p-5 text-white sm:inset-y-0 sm:left-auto sm:w-[360px]" role="dialog" aria-modal="true" aria-label="Post settings">
      <div class="mb-6 flex items-center justify-between"><h2 class="text-lg font-semibold">Post settings</h2><UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Close settings" @click="closeSettings" /></div>
      <div class="space-y-7 pb-[env(safe-area-inset-bottom)]">
        <SettingsSection title="Post">
          <UFormField label="Author"><p class="text-sm text-gray-200">{{ post?.author_name || 'Current author' }}</p></UFormField>
          <UFormField label="Category"><UInput v-model="form.category" /></UFormField>
          <UFormField label="Tags"><UInput v-model="tagsText" placeholder="Comma separated" /></UFormField>
          <UFormField label="Excerpt"><UTextarea v-model="form.excerpt" :placeholder="resolvedExcerpt" /><p class="mt-1 text-xs text-gray-400">{{ form.excerpt ? 'Custom' : `Auto: ${resolvedExcerpt}` }}</p></UFormField>
        </SettingsSection>
        <SettingsSection title="Publishing">
          <UFormField label="Status"><p class="text-sm text-gray-200">{{ statusLabel }}</p></UFormField>
          <UFormField label="Publish timing"><USelect v-model="publishTiming" :items="['Now', 'Scheduled']" /></UFormField>
          <UFormField v-if="publishTiming === 'Scheduled'" label="Scheduled for"><UInput v-model="form.scheduled_for" type="datetime-local" /></UFormField>
          <UFormField label="Visibility"><USelect v-model="form.visibility" :items="['public', 'unlisted']" /></UFormField>
        </SettingsSection>
        <SettingsSection title="Search & sharing">
          <div class="rounded-lg border border-white/10 bg-white/5 p-3"><p class="truncate text-sm text-blue-300">{{ resolvedSeo.title }}</p><p class="truncate text-xs text-green-300">{{ resolvedSeo.canonicalUrl }}</p><p class="mt-1 line-clamp-2 text-xs text-gray-300">{{ resolvedSeo.description }}</p></div>
          <UFormField label="SEO title"><UInput v-model="form.seo_title" :placeholder="form.title" /></UFormField>
          <UFormField label="Meta description"><UTextarea v-model="form.seo_description" :placeholder="resolvedExcerpt" /></UFormField>
          <UFormField label="Social image"><component :is="mediaPickerComponent || PlatformMediaPicker" :site-id="siteId" v-model="form.social_image_asset_id" accept="image" /></UFormField>
        </SettingsSection>
        <SettingsSection title="Advanced">
          <UFormField label="URL slug"><UInput v-model="form.slug" /><p class="mt-1 text-xs text-gray-400">{{ form.slug || generatedSlug }}</p></UFormField>
          <UCheckbox v-if="post?.first_published_at && form.slug !== post.slug" v-model="form.redirect_old_slug" label="Redirect old URL" />
          <UFormField label="Canonical URL"><UInput v-model="form.canonical_url" :placeholder="resolvedSeo.canonicalUrl" /></UFormField>
          <UFormField label="Robots"><UInput v-model="form.robots" placeholder="index, follow" /></UFormField>
        </SettingsSection>
        <UButton color="error" variant="ghost" block @click="remove">Delete post</UButton>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import BlogArticleRenderer from '~/components/blog/BlogArticleRenderer.vue'
import PlatformMediaPicker from '~/components/workspace/media/PlatformMediaPicker.vue'
import SettingsSection from './SettingsSection.vue'
import type { BlogPostRepository, BlogPost, BlogEditorBlock, PlatformBlogUpdateInput } from './types'
import { generatedExcerpt, normalizeBlogSlug, resolveBlogSeo } from '~/utils/blog-editor'
import { getErrorMessage } from '~/utils/errors'

const props = withDefaults(defineProps<{ repository: BlogPostRepository; postId?: string; siteId?: string; isEdit?: boolean; backUrl?: string; mediaPickerComponent?: Component; freeTextCategory?: boolean }>(), {
  postId: undefined, siteId: '', isEdit: false, backUrl: '/admin', mediaPickerComponent: undefined, freeTextCategory: false,
})
const route = useRoute()
const postId = computed(() => props.postId || String(route.params.postId || ''))
const post = ref<BlogPost | null>(null)
const blocks = ref<BlogEditorBlock[]>([])
const loadPending = ref(true)
const loadError = ref('')
const saveState = ref<'saved' | 'saving' | 'failed' | 'conflict'>('saved')
const lastSavedAt = ref(Date.now())
const clock = ref(Date.now())
const publishing = ref(false)
const settingsOpen = ref(false)
const inserterOpen = ref(false)
const settingsButton = ref()
let saveTimer: ReturnType<typeof setTimeout> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let dirty = false

const form = reactive({ title: '', category: '', excerpt: '', seo_title: '', seo_description: '', social_image_asset_id: '', slug: '', canonical_url: '', robots: '', visibility: 'public' as 'public' | 'unlisted', scheduled_for: '', redirect_old_slug: true })
const tagsText = ref('')
const publishTiming = ref<'Now' | 'Scheduled'>('Now')
const templateName = computed(() => post.value?.editor_template || (route.path.includes('/admin/') ? 'platform' : 'saya'))
const editorCanvasStyle = computed(() => {
  const tokens = post.value?.editor_theme_tokens ?? {}
  if (templateName.value !== 'blawby') return {}
  return {
    '--editor-canvas': String(tokens.bg || '#fbfaf7'), '--editor-ink': String(tokens.ink || '#162033'),
    '--blawby-bg': String(tokens.bg || '#fbfaf7'), '--blawby-surface': String(tokens.surface || '#fff'),
    '--blawby-primary': String(tokens.primary || '#25356c'), '--blawby-primary-dark': String(tokens.primaryDark || '#161f3b'),
    '--blawby-accent': String(tokens.accent || '#c19855'), '--blawby-border': String(tokens.border || '#e5e7eb'), '--blawby-ink': String(tokens.ink || '#162033'),
  }
})
const statusLabel = computed(() => post.value?.status === 'scheduled' ? 'Scheduled' : post.value?.published_at ? 'Published' : 'Draft')
const generatedSlug = computed(() => normalizeBlogSlug(form.title))
const resolvedExcerpt = computed(() => generatedExcerpt(blocks.value))
const resolvedSeo = computed(() => resolveBlogSeo({ title: form.title, seoTitle: form.seo_title, excerpt: form.excerpt || resolvedExcerpt.value, seoDescription: form.seo_description, slug: form.slug || generatedSlug.value, canonicalUrl: form.canonical_url, baseUrl: windowOrigin(), pathPrefix: post.value?.public_path?.startsWith('/article') ? '/article' : '/blog', robots: form.robots }))
const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…'
  if (saveState.value === 'failed') return 'Save failed'
  if (saveState.value === 'conflict') return 'Conflict — reload to reconcile'
  const seconds = Math.max(0, Math.floor((clock.value - lastSavedAt.value) / 1000))
  return seconds < 3 ? 'Saved just now' : `Saved ${seconds}s ago`
})
const inserterItems = [
  { type: 'image', label: 'Image', icon: 'i-lucide-image' },
  { type: 'faq', label: 'FAQ', icon: 'i-lucide-circle-help' },
  { type: 'how_to', label: 'How-To', icon: 'i-lucide-list-ordered' },
  { type: 'divider', label: 'Divider', icon: 'i-lucide-minus' },
] as const

watch([() => ({ ...form }), blocks, tagsText, publishTiming], () => queueSave(), { deep: true })
onMounted(async () => { clockTimer = setInterval(() => { clock.value = Date.now() }, 1000); window.addEventListener('beforeunload', beforeUnload); window.addEventListener('popstate', onPopState); await load() })
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer); if (saveTimer) clearTimeout(saveTimer); if (import.meta.client) { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', onPopState) } })

async function load() {
  if (!postId.value || !props.isEdit) { loadPending.value = false; return }
  try {
    const loaded = await props.repository.get(postId.value)
    post.value = loaded
    Object.assign(form, { title: loaded.title, category: loaded.category || '', excerpt: loaded.excerpt || '', seo_title: loaded.seo_title || '', seo_description: loaded.seo_description || '', social_image_asset_id: loaded.social_image_asset_id || '', slug: loaded.slug || '', canonical_url: loaded.canonical_url || '', robots: loaded.robots || '', visibility: loaded.visibility || 'public', scheduled_for: toLocalDatetime(loaded.scheduled_for), redirect_old_slug: true })
    tagsText.value = loaded.tags?.join(', ') || ''
    publishTiming.value = loaded.scheduled_for ? 'Scheduled' : 'Now'
    blocks.value = loaded.content_document?.blocks?.length ? structuredClone(loaded.content_document.blocks) : [{ type: 'markdown', data: { markdown: loaded.body || '' } }]
    for (const type of ['faq', 'how_to'] as const) {
      if (blocks.value.some(block => block.type === type)) continue
      const legacy = loaded.components?.find(component => component.type === type)
      if (legacy?.data) blocks.value.push({ type, data: structuredClone(legacy.data) as Record<string, unknown> })
    }
    lastSavedAt.value = Date.now()
  } catch (error) { loadError.value = getErrorMessage(error, 'Failed to load post.') } finally { loadPending.value = false }
}
function queueSave() {
  if (loadPending.value || saveState.value === 'conflict') return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  if (!post.value && !props.isEdit) {
    if (form.title.trim() && serializeBody().trim() && (props.freeTextCategory || form.category.trim())) saveTimer = setTimeout(() => void createDraft(false), 900)
    return
  }
  if (post.value) saveTimer = setTimeout(() => void flushSave(), 900)
}
async function flushSave() {
  if (!dirty || !post.value) return post.value
  if (saveTimer) clearTimeout(saveTimer)
  saveState.value = 'saving'
  const scheduledFor = publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null
  const payload: PlatformBlogUpdateInput = { title: form.title, category: form.category || null, tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean), excerpt: form.excerpt || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null, social_image_asset_id: form.social_image_asset_id || null, slug: form.slug !== post.value.slug ? (form.slug || generatedSlug.value) : undefined, redirect_old_slug: form.redirect_old_slug, canonical_url: form.canonical_url || null, robots: form.robots || null, visibility: form.visibility, scheduled_for: scheduledFor, content_blocks: blocks.value, expected_document_updated_at: post.value.content_document?.document.updated_at, expected_updated_at: post.value.updated_at || undefined }
  try {
    const updated = await props.repository.update(postId.value, payload)
    post.value = updated
    form.slug = updated.slug || form.slug
    if (updated.content_document?.blocks) blocks.value = structuredClone(updated.content_document.blocks)
    dirty = false; saveState.value = 'saved'; lastSavedAt.value = Date.now(); return updated
  } catch (error: unknown) {
    const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status)
    saveState.value = status === 409 ? 'conflict' : 'failed'
    throw error
  }
}
async function publish() { publishing.value = true; try { if (!post.value) { await createDraft(true); return } await flushSave(); const updated = await props.repository.update(postId.value, { publish: true, scheduled_for: publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null }); post.value = updated; saveState.value = 'saved' } catch { if (saveState.value !== 'conflict') saveState.value = 'failed' } finally { publishing.value = false } }
async function createDraft(publishNow: boolean) {
  if (!form.title.trim() || !serializeBody().trim()) return
  saveState.value = 'saving'
  const components = blocks.value.filter(block => block.type === 'faq' || block.type === 'how_to').map((block, position) => ({ type: block.type as 'faq' | 'how_to', position, data: block.data }))
  const created = await props.repository.create({ title: form.title, body: serializeBody(), category: form.category || null, tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean), excerpt: form.excerpt || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null, canonical_url: form.canonical_url || null, robots: form.robots || null, visibility: form.visibility, scheduled_for: publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null, components, publish: publishNow })
  dirty = false
  await navigateTo(props.repository.editUrl(created.id))
}
function serializeBody() { return blocks.value.map(block => block.type === 'heading' ? `${'#'.repeat(Math.max(2, Math.min(6, block.level || 2)))} ${String(block.data.text || '')}` : block.type === 'markdown' ? String(block.data.markdown || '') : block.type === 'divider' ? '---' : `{{component type="${block.type}"}}`).filter(Boolean).join('\n\n') }
function updateBlock(index: number, block: BlogEditorBlock) { blocks.value[index] = block }
function setBlockData(index: number, key: string, value: unknown) { blocks.value[index] = { ...blocks.value[index]!, data: { ...blocks.value[index]!.data, [key]: value } } }
function insertBlock(type: typeof inserterItems[number]['type']) { const data = type === 'faq' ? { items: [{ question: '', answer: '' }] } : type === 'how_to' ? { steps: [{ text: '' }] } : type === 'image' ? { asset_id: '', public_url: '', alt: '', caption: '' } : {}; blocks.value.push({ type, data }); inserterOpen.value = false }
function removeBlock(index: number) { blocks.value.splice(index, 1); if (!blocks.value.length) blocks.value.push({ type: 'markdown', data: { markdown: '' } }) }
function moveBlock(index: number, delta: -1 | 1) { const target = index + delta; if (target < 0 || target >= blocks.value.length) return; const [block] = blocks.value.splice(index, 1); if (block) blocks.value.splice(target, 0, block) }
function changeImage(index: number, value: unknown) { const asset = value && typeof value === 'object' ? value as { id?: unknown; publicUrl?: unknown; thumbnailUrl?: unknown } : null; blocks.value[index] = { ...blocks.value[index]!, data: { ...blocks.value[index]!.data, asset_id: typeof asset?.id === 'string' ? asset.id : '', public_url: typeof asset?.publicUrl === 'string' ? asset.publicUrl : typeof asset?.thumbnailUrl === 'string' ? asset.thumbnailUrl : '' } } }
function serializeFaq(block: BlogEditorBlock) { return (Array.isArray(block.data.items) ? block.data.items : []).map((item) => { const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return `Q: ${String(record.question || '')}\nA: ${String(record.answer || '')}` }).join('\n\n') }
function parseFaq(index: number, value: string) { const items = value.split(/\n\s*\n/).map(pair => { const q = pair.match(/^Q:\s*(.*)$/im)?.[1] || ''; const a = pair.match(/^A:\s*([\s\S]*)$/im)?.[1] || ''; return { question: q.trim(), answer: a.trim() } }); setBlockData(index, 'items', items) }
function serializeHowTo(block: BlogEditorBlock) { return (Array.isArray(block.data.steps) ? block.data.steps : []).map((step, index: number) => { const record = step && typeof step === 'object' ? step as Record<string, unknown> : {}; return `${index + 1}. ${String(record.text || record.name || '')}` }).join('\n') }
function parseHowTo(index: number, value: string) { setBlockData(index, 'steps', value.split('\n').map(line => ({ text: line.replace(/^\s*\d+[.)]\s*/, '').trim() })).filter(step => step.text)) }
async function share() { const url = new URL(post.value?.edit_url || props.repository.editUrl(postId.value), windowOrigin()).toString(); await navigator.clipboard?.writeText(url) }
async function goBack() { try { await flushSave(); await navigateTo(props.backUrl) } catch { if (saveState.value !== 'conflict') saveState.value = 'failed' } }
function openSettings() { settingsOpen.value = true; if (import.meta.client) history.pushState({ blogSettings: true }, '') }
function closeSettings() { settingsOpen.value = false; nextTick(() => settingsButton.value?.$el?.focus?.()) }
function onPopState() { if (settingsOpen.value) closeSettings() }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty) event.preventDefault() }
async function remove() { if (!confirm('Delete this post permanently?')) return; await props.repository.delete(postId.value); await navigateTo(props.backUrl) }
function windowOrigin() { return import.meta.client ? window.location.origin : 'https://krabiclaw.com' }
function toLocalDatetime(value?: string | null) { if (!value) return ''; const d = new Date(value); const offset = d.getTimezoneOffset() * 60_000; return new Date(d.getTime() - offset).toISOString().slice(0, 16) }
</script>

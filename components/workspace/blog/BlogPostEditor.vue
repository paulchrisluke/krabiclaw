<template>
  <div class="fixed inset-0 z-50 flex min-h-0 flex-col bg-default text-default">
    <header class="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-default bg-elevated px-2 pb-[env(safe-area-inset-top)] sm:px-4">
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" @click="goBack">Posts</UButton>
      <p class="min-w-0 flex-1 truncate text-xs text-muted sm:text-sm">
        {{ statusLabel }} · <span :class="saveState === 'failed' || saveState === 'conflict' ? 'text-error' : ''">{{ saveLabel }}</span>
      </p>
      <UButton icon="i-lucide-share-2" color="neutral" variant="ghost" size="sm" aria-label="Share editor" :disabled="!post" @click="share"><span class="hidden sm:inline">Share</span></UButton>
      <UButton ref="settingsButton" icon="i-lucide-settings" color="neutral" variant="ghost" size="sm" aria-label="Post settings" @click="openSettings"><span class="hidden sm:inline">Settings</span></UButton>
      <UButton v-if="post?.published_at" color="neutral" variant="soft" size="sm" :loading="unpublishing" @click="unpublish">Unpublish</UButton>
      <UButton size="sm" :loading="publishing" :disabled="loadPending || saveState === 'conflict'" @click="publish">Publish</UButton>
    </header>

    <div v-if="loadPending" class="grid min-h-0 flex-1 place-items-center"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" /></div>
    <div v-else-if="loadError" class="grid min-h-0 flex-1 place-items-center p-6"><UAlert color="error" :description="loadError" /></div>
    <main v-else class="min-h-0 flex-1 overflow-y-auto bg-[var(--editor-canvas,#fff)] text-[var(--editor-ink,#1f2937)] [overscroll-behavior:contain]" :style="editorCanvasStyle">
      <div class="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <BlogArticleView
          v-model:title="form.title"
          :excerpt="form.excerpt || null"
          :category="form.category || null"
          :published-at="post?.published_at || post?.created_at || null"
          :updated-at="post?.updated_at || null"
          :author-name="resolvedAuthorName"
          :author-image="post?.author_image || null"
          :site-name="resolvedSiteName"
          :media-url="resolvedSocialImageUrl"
          :media-kind="resolvedMediaKind"
          :read-minutes="readMinutes"
          :blocks="blocks"
          :template="templateName"
          editable
          :show-meta="false"
          @update:block="updateBlock"
          @insert-block="handleInsertBlock"
          @insert-block-type="handleInsertBlockType"
          @move-block="moveBlock"
          @merge-block="handleMergeBlock"
          @split-insert="handleSplitInsert"
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
        </BlogArticleView>
      </div>
    </main>

    <USlideover v-model:open="settingsOpen" title="Post settings" side="right" modal @after:enter="focusSettingsPanel" @after:leave="restoreSettingsFocus">
      <template #body>
        <div ref="settingsPanel" class="space-y-7 py-5 pb-[env(safe-area-inset-bottom)]" tabindex="-1" @keydown="onSettingsKeydown">
          <UFormField label="Category"><UInput v-model="form.category" /></UFormField>
          <UFormField label="Tags"><UInput v-model="tagsText" placeholder="Comma separated" /></UFormField>
          <UFormField label="Excerpt"><UTextarea v-model="form.excerpt" :placeholder="resolvedExcerpt" /><p class="mt-1 text-xs text-dimmed">{{ form.excerpt ? 'Custom' : `Auto: ${resolvedExcerpt}` }}</p></UFormField>
          <UCard>
            <template #header><h3 class="font-semibold text-highlighted">Publishing</h3></template>
            <div class="space-y-4">
            <UFormField label="Status"><p class="text-sm text-muted">{{ statusLabel }}</p></UFormField>
            <UFormField label="Publish timing"><USelect v-model="publishTiming" :items="['Now', 'Scheduled']" /></UFormField>
            <UFormField v-if="publishTiming === 'Scheduled'" label="Scheduled for"><UInput v-model="form.scheduled_for" type="datetime-local" /></UFormField>
            <UFormField label="Visibility"><USelect v-model="form.visibility" :items="['public', 'unlisted']" /></UFormField>
            </div>
          </UCard>
          <UCard>
            <template #header><h3 class="font-semibold text-highlighted">Search & sharing</h3></template>
            <div class="space-y-4">
            <div class="rounded-lg border border-default bg-muted p-3"><p class="truncate text-sm text-primary">{{ resolvedSeo.title }}</p><p class="truncate text-xs text-success">{{ resolvedSeo.canonicalUrl }}</p><p class="mt-1 line-clamp-2 text-xs text-muted">{{ resolvedSeo.description }}</p></div>
            <UFormField label="SEO title"><UInput v-model="form.seo_title" :placeholder="form.title" /></UFormField>
            <UFormField label="Meta description"><UTextarea v-model="form.seo_description" :placeholder="resolvedExcerpt" /></UFormField>
            <UFormField label="Social image"><img v-if="resolvedSocialImageUrl" :src="resolvedSocialImageUrl" alt="Resolved social preview" class="mb-2 aspect-video w-full rounded-lg object-cover"><component :is="mediaPickerComponent || PlatformMediaPicker" :site-id="siteId" v-model="form.social_image_asset_id" accept="image" /></UFormField>
            </div>
          </UCard>
          <UCard>
            <template #header><h3 class="font-semibold text-highlighted">Advanced</h3></template>
            <div class="space-y-4">
            <UFormField label="URL slug"><UInput v-model="form.slug" :disabled="slugResetRequested" /><div class="mt-1 flex items-center justify-between gap-3"><p class="text-xs text-dimmed">{{ slugResetRequested ? generatedSlug : form.slug || generatedSlug }}</p><button v-if="post?.slug_manually_overridden" type="button" class="text-xs text-primary hover:underline" @click="resetSlugOverride">Use automatic slug</button></div></UFormField>
            <UCheckbox v-if="post?.first_published_at && form.slug !== post.slug" v-model="form.redirect_old_slug" label="Redirect old URL" />
            <UFormField label="Canonical URL"><UInput v-model="form.canonical_url" :placeholder="resolvedSeo.canonicalUrl" /></UFormField>
            <UFormField label="Robots"><UInput v-model="form.robots" placeholder="index, follow" /></UFormField>
            </div>
          </UCard>
          <UButton v-if="post" color="error" variant="ghost" block @click="remove">Delete post</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import BlogArticleView from '~/components/blog/BlogArticleView.vue'
import PlatformMediaPicker from '~/components/workspace/media/PlatformMediaPicker.vue'
import type { BlogPostRepository, BlogPost, BlogEditorBlock, PlatformBlogUpdateInput } from './types'
import { generatedExcerpt, initialBlogEditorBlocks, normalizeBlogSlug, resolveBlogPublicPath, resolveBlogSeo, SerializedSnapshotQueue } from '~/utils/blog-editor'
import { getErrorMessage } from '~/utils/errors'

const props = withDefaults(defineProps<{ repository: BlogPostRepository; postId?: string; siteId?: string; isEdit?: boolean; backUrl?: string; mediaPickerComponent?: Component; freeTextCategory?: boolean }>(), {
  postId: undefined, siteId: '', isEdit: false, backUrl: '/admin', mediaPickerComponent: undefined, freeTextCategory: false,
})
const route = useRoute()
const postId = computed(() => props.postId || String(route.params.postId || ''))
const post = ref<BlogPost | null>(null)
const blocks = ref<BlogEditorBlock[]>(initialBlogEditorBlocks())
const loadPending = ref(true)
const loadError = ref('')
const saveState = ref<'saved' | 'saving' | 'failed' | 'conflict'>('saved')
const publishing = ref(false)
const unpublishing = ref(false)
const settingsOpen = ref(false)
const settingsButton = ref<{ $el?: HTMLElement } | null>(null)
const settingsPanel = ref<HTMLElement | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | undefined
let dirty = false
let applyingServerSnapshot = false
let createDraftPromise: Promise<BlogPost | null> | null = null
let publishAfterCreateRequested = false
let serverPostUpdatedAt: string | undefined
let serverDocumentUpdatedAt: string | undefined
const slugResetRequested = ref(false)

const form = reactive({ title: '', category: '', excerpt: '', seo_title: '', seo_description: '', social_image_asset_id: '', slug: '', canonical_url: '', robots: '', visibility: 'public' as 'public' | 'unlisted', scheduled_for: '', redirect_old_slug: true })
const tagsText = ref('')
const publishTiming = ref<'Now' | 'Scheduled'>('Now')
const templateName = computed(() => post.value?.editor_template || (route.path.includes('/admin/') ? 'platform' : 'saya'))
const editorCanvasStyle = computed(() => {
  const tokens = post.value?.editor_theme_tokens ?? {}
  if (templateName.value === 'saya') {
    const primary = String(tokens.primary || post.value?.editor_brand_color || '#8F1D21')
    const background = String(tokens.bg || '#FFFFFF')
    const foreground = String(tokens.ink || '#18181B')
    const muted = String(tokens.muted || '#52525B')
    return {
      '--editor-canvas': background, '--editor-ink': foreground, '--brand-color': primary,
      '--saya-primary': primary, '--saya-bg': background, '--saya-bg-alt': String(tokens.surface || '#FAFAFA'),
      '--saya-fg': foreground, '--saya-fg-muted': muted, '--saya-border': String(tokens.border || '#E4E4E7'),
      // Dashboard controls use Nuxt UI tokens, so bridge them to the site's
      // theme while the editor canvas is active.
      '--ui-primary': primary, '--ui-bg': background, '--ui-bg-elevated': String(tokens.surface || '#FAFAFA'), '--ui-text': foreground,
      '--ui-text-highlighted': foreground, '--ui-text-muted': muted, '--ui-text-dimmed': muted,
    }
  }
  if (templateName.value !== 'blawby') return { '--editor-canvas': 'var(--ui-bg-elevated)', '--editor-ink': 'var(--ui-text)' }
  const ink = String(tokens.ink || '#162033')
  return {
    '--editor-canvas': String(tokens.bg || '#fbfaf7'), '--editor-ink': ink,
    '--blawby-bg': String(tokens.bg || '#fbfaf7'), '--blawby-surface': String(tokens.surface || '#fff'),
    '--blawby-primary': String(tokens.primary || '#25356c'), '--blawby-primary-dark': String(tokens.primaryDark || '#161f3b'),
    '--blawby-accent': String(tokens.accent || '#c19855'), '--blawby-border': String(tokens.border || '#e5e7eb'), '--blawby-ink': ink,
    // See the saya branch above for why these three are needed alongside --editor-ink.
    '--ui-text-highlighted': ink, '--ui-text-muted': `color-mix(in srgb, ${ink} 70%, transparent)`, '--ui-text-dimmed': `color-mix(in srgb, ${ink} 55%, transparent)`,
  }
})
const statusLabel = computed(() => post.value?.status === 'scheduled' ? 'Scheduled' : post.value?.published_at ? 'Published' : 'Draft')
const generatedSlug = computed(() => normalizeBlogSlug(form.title))
const resolvedExcerpt = computed(() => generatedExcerpt(blocks.value))
const resolvedSiteName = computed(() => post.value?.editor_site_name || (props.siteId ? 'Our Site' : 'KrabiClaw'))
const resolvedAuthorName = computed(() => post.value?.author_name?.trim() || resolvedSiteName.value)
const readMinutes = computed(() => Math.max(1, Math.ceil(serializeBody().trim().split(/\s+/).filter(Boolean).length / 200)))
const publicPath = computed(() => resolveBlogPublicPath({ scope: props.siteId ? 'tenant' : 'platform', template: templateName.value, slug: slugResetRequested.value ? generatedSlug.value : form.slug || generatedSlug.value, category: form.category }))
const resolvedSeo = computed(() => resolveBlogSeo({ title: form.title, seoTitle: form.seo_title, excerpt: form.excerpt || resolvedExcerpt.value, seoDescription: form.seo_description, slug: form.slug || generatedSlug.value, canonicalUrl: form.canonical_url, baseUrl: windowOrigin(), publicPath: publicPath.value, siteName: resolvedSiteName.value, robots: form.robots }))
const resolvedSocialImageUrl = computed<string | null>(() => {
  const block = blocks.value.find(item => item.type === 'image')
  const candidate = post.value?.social_image?.thumbnail_url || post.value?.social_image?.public_url || block?.data.thumbnail_url || block?.data.public_url || post.value?.featured_image?.public_url
  return typeof candidate === 'string' && candidate ? candidate : null
})
const resolvedMediaKind = computed(() => {
  const block = blocks.value.find(item => item.type === 'image')
  const hasImageOverride = Boolean(
    post.value?.social_image?.thumbnail_url
    || post.value?.social_image?.public_url
    || block?.data.thumbnail_url
    || block?.data.public_url,
  )
  return !hasImageOverride && post.value?.featured_image?.kind === 'video' ? 'video' : 'image'
})
const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…'
  if (saveState.value === 'failed') return 'Save failed'
  if (saveState.value === 'conflict') return 'Conflict — reload to reconcile'
  return 'Saved'
})
type InserterBlockType = 'image' | 'faq' | 'how_to' | 'divider'

type SaveSnapshot = { postId: string; payload: PlatformBlogUpdateInput }
const saveQueue = new SerializedSnapshotQueue<SaveSnapshot, BlogPost>(
  async (snapshot) => {
    const updated = await props.repository.update(snapshot.postId, {
      ...snapshot.payload,
      expected_updated_at: serverPostUpdatedAt,
      expected_document_updated_at: serverDocumentUpdatedAt,
    })
    syncServerVersions(updated)
    return updated
  },
  (updated) => {
    applyingServerSnapshot = true
    post.value = updated
    form.slug = updated.slug || form.slug
    slugResetRequested.value = false
    if (updated.content_document?.blocks) blocks.value = structuredClone(updated.content_document.blocks)
    dirty = false
    saveState.value = 'saved'
    void nextTick(() => { applyingServerSnapshot = false })
  },
)

watch([() => ({ ...form }), blocks, tagsText, publishTiming, slugResetRequested], () => { if (!applyingServerSnapshot) queueSave() }, { deep: true, flush: 'sync' })
onMounted(async () => { window.addEventListener('beforeunload', beforeUnload); window.addEventListener('popstate', onPopState); await load() })
onBeforeUnmount(() => { if (saveTimer) clearTimeout(saveTimer); if (import.meta.client) { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', onPopState) } })

async function load() {
  if (!postId.value || !props.isEdit) { loadPending.value = false; return }
  try {
    const loaded = await props.repository.get(postId.value)
    syncServerVersions(loaded)
    post.value = loaded
    Object.assign(form, { title: loaded.title, category: loaded.category || '', excerpt: loaded.excerpt || '', seo_title: loaded.seo_title || '', seo_description: loaded.seo_description || '', social_image_asset_id: loaded.social_image_asset_id || '', slug: loaded.slug || '', canonical_url: loaded.canonical_url || '', robots: loaded.robots || '', visibility: loaded.visibility || 'public', scheduled_for: toLocalDatetime(loaded.scheduled_for), redirect_old_slug: true })
    slugResetRequested.value = false
    tagsText.value = loaded.tags?.join(', ') || ''
    publishTiming.value = loaded.scheduled_for ? 'Scheduled' : 'Now'
    if (!loaded.content_document) throw new Error('Blog content document is missing')
    blocks.value = structuredClone(loaded.content_document.blocks || [])
    ensureTrailingTextBlock()
  } catch (error) { loadError.value = getErrorMessage(error, 'Failed to load post.') } finally { loadPending.value = false }
}
function queueSave() {
  if (loadPending.value || saveState.value === 'conflict') return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  if (!post.value && !props.isEdit) {
    if (isDraftValid()) saveTimer = setTimeout(() => { void createDraft(false).catch(() => {}) }, 900)
    return
  }
  if (post.value) {
    saveQueue.mark(buildSaveSnapshot())
    saveTimer = setTimeout(() => { void flushSave().catch(() => {}) }, 900)
  }
}
async function flushSave() {
  if (!dirty) return post.value
  if (!post.value) {
    if (!isDraftValid()) throw new Error('Complete the title, article body, and category before leaving this draft.')
    return await createDraft(false)
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveState.value = 'saving'
  try {
    await saveQueue.flush()
    return post.value
  } catch (error: unknown) {
    const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status)
    saveState.value = status === 409 ? 'conflict' : 'failed'
    throw error
  }
}
function buildSaveSnapshot(id = postId.value): SaveSnapshot {
  const scheduledFor = publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null
  return { postId: id, payload: { title: form.title, category: form.category || null, tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean), excerpt: form.excerpt || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null, social_image_asset_id: form.social_image_asset_id || null, slug: slugResetRequested.value ? null : form.slug !== post.value?.slug ? form.slug : undefined, reset_slug_override: slugResetRequested.value || undefined, redirect_old_slug: form.redirect_old_slug, canonical_url: form.canonical_url || null, robots: form.robots || null, visibility: form.visibility, scheduled_for: scheduledFor, content_blocks: structuredClone(toRaw(blocks.value)) } }
}
async function publish() { publishing.value = true; try { if (!post.value) { await createDraft(true); return } if (dirty) saveQueue.mark(buildSaveSnapshot()); await saveQueue.runExclusive(async () => { const updated = await props.repository.update(postId.value, { publish: true, scheduled_for: publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null, expected_updated_at: serverPostUpdatedAt }); syncServerVersions(updated); post.value = updated; return updated }); saveState.value = 'saved' } catch (error: unknown) { const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status); saveState.value = status === 409 ? 'conflict' : 'failed' } finally { publishing.value = false } }
async function unpublish() { if (!post.value) return; unpublishing.value = true; try { if (dirty) saveQueue.mark(buildSaveSnapshot()); await saveQueue.runExclusive(async () => { const updated = await props.repository.update(postId.value, { unpublish: true, expected_updated_at: serverPostUpdatedAt }); syncServerVersions(updated); post.value = updated; return updated }); saveState.value = 'saved' } catch (error: unknown) { const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status); saveState.value = status === 409 ? 'conflict' : 'failed' } finally { unpublishing.value = false } }
async function createDraft(publishNow: boolean) {
  if (!isDraftValid()) return null
  publishAfterCreateRequested ||= publishNow
  if (createDraftPromise) return await createDraftPromise
  createDraftPromise = (async () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveState.value = 'saving'
    dirty = false
    let created = await props.repository.create({ title: form.title, content_blocks: structuredClone(toRaw(blocks.value)), category: form.category || null, tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean), excerpt: form.excerpt || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null, social_image_asset_id: form.social_image_asset_id || null, canonical_url: form.canonical_url || null, robots: form.robots || null, visibility: form.visibility, scheduled_for: publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null, publish: publishNow })
    applyingServerSnapshot = true
    post.value = created
    syncServerVersions(created)
    form.slug = created.slug || form.slug
    await nextTick()
    applyingServerSnapshot = false
    if (dirty) {
      saveQueue.mark(buildSaveSnapshot(created.id))
      await flushSave()
      created = post.value || created
    }
    if (publishAfterCreateRequested && !created.published_at && created.status !== 'published') {
      created = await saveQueue.runExclusive(async () => await props.repository.update(created.id, {
        publish: true,
        scheduled_for: publishTiming.value === 'Scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
        expected_updated_at: serverPostUpdatedAt,
      }))
      syncServerVersions(created)
      post.value = created
    }
    dirty = false
    saveState.value = 'saved'
    await navigateTo(props.repository.editUrl(created.id))
    return created
  })().catch((error: unknown) => {
    dirty = true
    const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status)
    saveState.value = status === 409 ? 'conflict' : 'failed'
    throw error
  }).finally(() => {
    createDraftPromise = null
    publishAfterCreateRequested = false
  })
  return await createDraftPromise
}
function isDraftValid() { return Boolean(form.title.trim() && serializeBody().trim() && (props.freeTextCategory || form.category.trim())) }
function serializeBody() { return blocks.value.map(block => block.type === 'heading' ? `${'#'.repeat(Math.max(2, Math.min(6, block.level || 2)))} ${String(block.data.text || '')}` : block.type === 'markdown' ? String(block.data.markdown || '') : block.type === 'divider' ? '---' : `{{component type="${block.type}"}}`).filter(Boolean).join('\n\n') }
function updateBlock(index: number, block: BlogEditorBlock) { blocks.value[index] = block }
function setBlockData(index: number, key: string, value: unknown) { blocks.value[index] = { ...blocks.value[index]!, data: { ...blocks.value[index]!.data, [key]: value } } }
function handleInsertBlock(index: number, _cursorPosition: number) {
  const block = blocks.value[index]
  if (!block || (block.type !== 'markdown' && block.type !== 'heading')) return

  blocks.value.splice(index + 1, 0, { type: 'markdown', data: { markdown: '', editor_mode: 'rich' } })
}
function structuralBlockData(type: string) {
  return type === 'faq' ? { items: [{ question: '', answer: '' }] } : type === 'how_to' ? { steps: [{ text: '' }] } : type === 'image' ? { asset_id: '', public_url: '', alt: '', caption: '' } : {}
}
// A non-text block (image/FAQ/how-to/divider/etc.) left as the last block in
// the post is a dead end — there's no textarea or rich editor to click into
// below it, so there's no way to keep writing. Every insert path must leave
// the array ending on a markdown/heading block.
function ensureTrailingTextBlock() {
  const last = blocks.value[blocks.value.length - 1]
  if (!last || (last.type !== 'markdown' && last.type !== 'heading')) {
    blocks.value.push({ type: 'markdown', data: { markdown: '', editor_mode: 'rich' } })
  }
}
function handleInsertBlockType(index: number, type: string) {
  const newBlock = { type: type as InserterBlockType, data: structuralBlockData(type) }
  const current = blocks.value[index]
  const currentIsEmptyText = Boolean(current && (current.type === 'markdown' || current.type === 'heading') && !String(current.data[current.type === 'heading' ? 'text' : 'markdown'] || '').trim())
  // Only overwrite the block in place when it's an empty starter block — otherwise this
  // would silently delete whatever the user had already written into it.
  if (currentIsEmptyText) blocks.value[index] = newBlock
  else blocks.value.splice(index + 1, 0, newBlock)
  ensureTrailingTextBlock()
}
function moveBlock(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= blocks.value.length) return
  const [block] = blocks.value.splice(index, 1)
  if (block) blocks.value.splice(target, 0, block)
}
// Fired when the user picks Image/FAQ/How-To from the "/" menu mid-paragraph
// (see RichTextEditor.vue's splitAtCursorAndInsert). The rich editor has
// already truncated blocks[index] to just the "before" half via the normal
// update:modelValue flow by the time this fires — we only need to insert the
// new structural block, plus a fresh markdown block for whatever came after
// the cursor (skipped entirely if there was nothing after it).
function handleSplitInsert(index: number, payload: { after: string; blockType: 'image' | 'faq' | 'how_to'; editorMode: 'rich' | 'source' }) {
  const newBlocks: BlogEditorBlock[] = [{ type: payload.blockType, data: structuralBlockData(payload.blockType) }]
  if (payload.after.length > 0) newBlocks.push({ type: 'markdown', data: { markdown: payload.after, editor_mode: payload.editorMode } })
  blocks.value.splice(index + 1, 0, ...newBlocks)
  ensureTrailingTextBlock()
}
function handleMergeBlock(index: number, direction: 'back' | 'forward') {
  if (direction === 'back' && index > 0) {
    const currentBlock = blocks.value[index]
    const prevBlock = blocks.value[index - 1]
    if (prevBlock && currentBlock && prevBlock.type === 'markdown' && currentBlock.type === 'markdown') {
      const mergedText = String(prevBlock.data.markdown || '') + String(currentBlock.data.markdown || '')
      blocks.value[index - 1] = { ...prevBlock, data: { ...prevBlock.data, markdown: mergedText } }
      blocks.value.splice(index, 1)
    } else {
      blocks.value.splice(index, 1)
    }
  } else if (direction === 'forward' && index < blocks.value.length - 1) {
    const currentBlock = blocks.value[index]
    const nextBlock = blocks.value[index + 1]
    if (currentBlock && nextBlock && currentBlock.type === 'markdown' && nextBlock.type === 'markdown') {
      const mergedText = String(currentBlock.data.markdown || '') + String(nextBlock.data.markdown || '')
      blocks.value[index] = { ...currentBlock, data: { ...currentBlock.data, markdown: mergedText } }
      blocks.value.splice(index + 1, 1)
    } else {
      blocks.value.splice(index, 1)
    }
  }
  ensureTrailingTextBlock()
}
function changeImage(index: number, value: unknown) { const asset = value && typeof value === 'object' ? value as { id?: unknown; publicUrl?: unknown; thumbnailUrl?: unknown } : null; blocks.value[index] = { ...blocks.value[index]!, data: { ...blocks.value[index]!.data, asset_id: typeof asset?.id === 'string' ? asset.id : '', public_url: typeof asset?.publicUrl === 'string' ? asset.publicUrl : typeof asset?.thumbnailUrl === 'string' ? asset.thumbnailUrl : '' } } }
async function share() { if (!post.value || !postId.value) return; const url = new URL(post.value.edit_url || props.repository.editUrl(postId.value), windowOrigin()).toString(); await navigator.clipboard?.writeText(url) }
async function goBack() { if (settingsOpen.value) { closeSettings(); return } try { await flushSave(); await navigateTo(props.backUrl) } catch { if (saveState.value !== 'conflict') saveState.value = 'failed' } }
function openSettings() { settingsOpen.value = true; if (import.meta.client) history.pushState({ blogSettings: true }, '') }
function closeSettings() { settingsOpen.value = false }
function settingsFocusableElements() {
  if (!settingsPanel.value) return []
  return Array.from(settingsPanel.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
}
function focusSettingsPanel() {
  const first = settingsFocusableElements()[0]
  if (first) first.focus()
  else settingsPanel.value?.focus()
}
function restoreSettingsFocus() { settingsButton.value?.$el?.focus() }
function onSettingsKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return }
  if (event.key !== 'Tab') return
  const focusable = settingsFocusableElements()
  if (!focusable.length) { event.preventDefault(); settingsPanel.value?.focus(); return }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function onPopState() { if (settingsOpen.value) closeSettings() }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty) event.preventDefault() }
async function remove() { if (!post.value || !postId.value || !confirm('Delete this post permanently?')) return; await props.repository.delete(postId.value); await navigateTo(props.backUrl) }
function windowOrigin() { return import.meta.client ? window.location.origin : 'https://krabiclaw.com' }
function toLocalDatetime(value?: string | null) { if (!value) return ''; const d = new Date(value); const offset = d.getTimezoneOffset() * 60_000; return new Date(d.getTime() - offset).toISOString().slice(0, 16) }
function resetSlugOverride() { slugResetRequested.value = true; form.slug = generatedSlug.value }
function syncServerVersions(value: BlogPost) { serverPostUpdatedAt = value.updated_at || serverPostUpdatedAt; serverDocumentUpdatedAt = value.content_document?.document.updated_at || serverDocumentUpdatedAt }

onBeforeRouteLeave(async () => {
  if (settingsOpen.value) { settingsOpen.value = false; return false }
  if (dirty && !post.value && !isDraftValid()) return confirm('This draft is incomplete and cannot be saved yet. Leave without saving it?')
  try { await flushSave(); return true } catch { return false }
})
</script>

<template>
  <!--
    A blog post is read the way every other record is: the thing itself first,
    then the rows that describe it. The canvas takes the place a product's
    photograph takes on its hub — it does not take the place of the hub.

    With nothing below it open this level is its parent's detail column, so it
    draws no panel and no navbar. It draws them only once a section is open and
    the parent has yielded, which is the same rule every other editor follows.
  -->
  <div v-if="frame.mode.value === 'index'" :inert="publishing" class="space-y-8">
    <p v-if="actionError" role="alert" class="rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error">{{ actionError }}</p>

    <div v-if="loadPending" class="grid min-h-64 place-items-center"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" /></div>
    <UAlert v-else-if="loadError" color="error" variant="soft" :description="loadError" />

    <template v-else>
      <div class="overflow-hidden rounded-lg bg-[var(--editor-canvas,#fff)] text-[var(--editor-ink,#1f2937)]" :style="editorCanvasStyle">
        <div class="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <BlogArticleView
            v-model:title="form.title"
            :excerpt="form.excerpt || null"
            :category="form.category || null"
            :published-at="post?.published_at || post?.created_at || null"
            :updated-at="post?.updated_at || null"
            :author-name="resolvedSiteName"
            :site-name="resolvedSiteName"
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
            <template #cover-empty>
              <button type="button" class="mb-8 flex aspect-video w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-current/30 text-sm opacity-70 transition hover:border-current/60 hover:opacity-100" @click="addCover">
                <UIcon name="i-lucide-image-plus" class="size-4" />
                Add a cover photo
              </button>
            </template>
            <template #image-editor="{ block, index }">
              <component
                :is="mediaPickerComponent"
                :site-id="siteId"
                :model-value="block.media?.find(item => item.slot === 'media')?.asset_id || ''"
                accept="image"
                @change="changeImage(index, $event)"
              />
              <!--
                Alt text is not asked for here. It describes the picture, so it
                belongs to the media asset and is edited once in the media
                library — not re-entered at every place the asset is used.
              -->
              <UInput class="mt-2 w-full" :model-value="String(block.data.caption || '')" placeholder="Caption" @update:model-value="value => setBlockData(index, 'caption', value)" />
            </template>
          </BlogArticleView>
        </div>
      </div>

      <!--
        The body autosaves, so there is no commit bar for it. This one line is
        the only place that state is reported.
      -->
      <p class="px-1 text-xs text-muted">
        <span :class="saveState === 'failed' || saveState === 'conflict' ? 'text-error' : ''">{{ saveLabel }}</span>
      </p>

      <EditorNavigationList :groups="settingsGroups" />

    </template>
  </div>

  <UDashboardPanel v-else :id="panelId">
    <template #header>
      <UDashboardNavbar :title="form.title || 'Untitled post'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="postPath" label="Post" />
        </template>
        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="actionError" role="alert" class="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error">{{ actionError }}</p>

      <EditorPaneShell
        has-detail
        :show-actions="section !== 'share'"
        :saving="savingExplicitly || publishing"
        :detail-title="sectionLabel"
        :dismiss-to="postPath"
        @cancel="cancelSection"
        @save="saveSection"
      >
        <template #index>
          <EditorNavigationList :groups="settingsGroups" :active-item="section" />
        </template>

        <template #detail>
          <template v-if="section === 'category'">
            <!-- KrabiClaw's own site publishes two collections; each files articles under a fixed category set that shapes the URL. -->
            <UFormField v-if="isPlatformTemplate" label="Collection" class="mb-4">
              <USelect v-model="form.collection" :items="collectionOptions" value-key="value" class="w-full" @update:model-value="form.category = ''" />
            </UFormField>
            <UFormField label="Category">
              <USelect v-if="isPlatformTemplate" v-model="form.category" :items="collectionCategories" class="w-full" />
              <UInput v-else v-model="form.category" autofocus class="w-full" />
            </UFormField>
          </template>

          <UFormField v-else-if="section === 'tags'" label="Tags" help="Comma separated">
            <UInput v-model="tagsText" autofocus class="w-full" />
          </UFormField>

          <UFormField v-else-if="section === 'excerpt'" label="Excerpt">
            <UTextarea v-model="form.excerpt" :rows="5" autofocus :placeholder="resolvedExcerpt" class="w-full" />
            <p class="mt-1 text-xs text-dimmed">{{ form.excerpt ? 'Custom' : `Auto: ${resolvedExcerpt}` }}</p>
          </UFormField>

          <!--
            Publishing is a leaf like any other, so it commits through the pane's
            own Cancel/Save bar. It used to carry its own "Publish now" button in
            the body as well, which put two commit mechanisms on one screen: the
            selects saved with the bar, the lifecycle went through a separate
            endpoint the moment you pressed it. That is the whole reason the CMS
            felt inconsistent about how you save — a tenant had to learn a second
            place to look, on exactly one screen.

            Save now carries the lifecycle change too. What the fields say when
            you press Save is what the post becomes.
          -->
          <div v-else-if="section === 'publishing'" class="space-y-5">
            <UFormField label="Status">
              <p class="text-sm text-muted">{{ lifecycleLabel }}</p>
            </UFormField>
            <UFormField v-if="!post || post.status === 'scheduled'" label="Publish timing">
              <USelect v-model="publishTiming" :items="['Now', 'Scheduled']" class="w-full" />
            </UFormField>
            <UFormField v-if="(!post || post.status === 'scheduled') && publishTiming === 'Scheduled'" label="Scheduled for (UTC)">
              <UInput v-model="form.scheduled_for" type="datetime-local" step="any" class="w-full" />
            </UFormField>
            <UFormField label="Visibility">
              <USelect v-model="form.visibility" :items="['public', 'unlisted']" class="w-full" />
            </UFormField>
          </div>

          <div v-else-if="section === 'search'" class="space-y-5">
            <div class="rounded-lg border border-default bg-muted p-3">
              <p class="truncate text-sm text-primary">{{ resolvedSeo.title }}</p>
              <p class="truncate text-xs text-success">{{ resolvedSeo.canonicalUrl }}</p>
              <p class="mt-1 line-clamp-2 text-xs text-muted">{{ resolvedSeo.description }}</p>
            </div>
            <UFormField label="SEO title"><UInput v-model="form.seo_title" :placeholder="form.title" class="w-full" /></UFormField>
            <UFormField label="Meta description"><UTextarea v-model="form.seo_description" :rows="4" :placeholder="resolvedExcerpt" class="w-full" /></UFormField>
          </div>

          <UFormField v-else-if="section === 'share'" label="Share preview">
            <img v-if="resolvedPrimaryImageUrl" :src="resolvedPrimaryImageUrl" alt="Resolved share preview" class="aspect-video w-full rounded-lg object-cover">
            <video v-else-if="resolvedPrimaryVideoUrl" :src="resolvedPrimaryVideoUrl" controls muted playsinline class="aspect-video w-full rounded-lg object-cover" />
            <p v-else class="text-xs text-dimmed">This post has no cover photo, so its share card cannot be generated. Add a picture at the top of the article.</p>
          </UFormField>

          <div v-else-if="section === 'url'" class="space-y-5">
            <UFormField label="URL slug">
              <UInput v-model="form.slug" :disabled="slugResetRequested" autofocus class="w-full" />
              <div class="mt-1 flex items-center justify-between gap-3">
                <p class="text-xs text-dimmed">{{ slugResetRequested ? generatedSlug : form.slug || generatedSlug }}</p>
                <UButton v-if="post?.slug_manually_overridden" size="xs" variant="link" @click="resetSlugOverride">Use automatic slug</UButton>
              </div>
            </UFormField>
            <UCheckbox v-if="post?.first_published_at && form.slug !== post.slug" v-model="form.redirect_old_slug" label="Redirect old URL" />
          </div>

          <UFormField v-else-if="section === 'canonical'" label="Canonical URL">
            <UInput v-model="form.canonical_url" autofocus :placeholder="resolvedSeo.canonicalUrl" class="w-full" />
          </UFormField>

          <UFormField v-else-if="section === 'robots'" label="Robots">
            <UInput v-model="form.robots" autofocus placeholder="index, follow" class="w-full" />
          </UFormField>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { instantDate } from '~/utils/timezone'
import type { Component } from 'vue'
import BlogArticleView from '~/components/blog/BlogArticleView.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { ARTICLE_COLLECTIONS, ARTICLE_COLLECTION_SLUGS, articleCollectionCategories, type ArticleCollection } from '~/utils/article-collections'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { publicTemplateRegistry } from '~/utils/template-registry'
import type { BlogLifecycleState, BlogPostRepository, BlogPost, BlogEditorBlock, BlogPostUpdateInput } from './types'
import { cloneEditorBlocks, generatedExcerpt, initialBlogEditorBlocks, normalizeBlogSlug, resolveBlogSeo, scheduledLifecycleValue, SerializedSnapshotQueue } from '~/utils/blog-editor'
import { getErrorMessage } from '~/utils/errors'
import { resolveSocialImageUrl } from '~/utils/social-metadata'

const props = withDefaults(defineProps<{ repository: BlogPostRepository; initialPost?: BlogPost | null; deferLoad?: boolean; postId?: string; siteId?: string; isEdit?: boolean; backUrl?: string; backLabel?: string; panelId?: string; mediaPickerComponent: Component }>(), {
  initialPost: null, deferLoad: false, postId: undefined, siteId: '', isEdit: false, backUrl: '/dashboard', backLabel: 'Posts', panelId: 'blog-post-editor',
})
const route = useRoute()
const postId = computed(() => props.postId || String(route.params.postId || ''))
const post = ref<BlogPost | null>(null)
const persistedPostId = computed(() => post.value?.id || postId.value)
const blocks = ref<BlogEditorBlock[]>(initialBlogEditorBlocks())
const interactive = ref(false)
const loadPending = ref(true)
const loadError = ref('')
const saveState = ref<'saved' | 'saving' | 'failed' | 'conflict'>('saved')
const actionError = ref('')
const publishing = ref(false)
const savingExplicitly = ref(false)
type SettingsSection = 'category' | 'tags' | 'excerpt' | 'publishing' | 'search' | 'share' | 'url' | 'canonical' | 'robots'
const SETTINGS_SECTIONS: SettingsSection[] = ['category', 'tags', 'excerpt', 'publishing', 'search', 'share', 'url', 'canonical', 'robots']
const contentDirty = ref(false)
const lifecycleDirty = ref(false)
const dirtyState = computed(() => contentDirty.value || lifecycleDirty.value)
let applyingServerSnapshot = false
let serverPostUpdatedAt: string | undefined
const slugResetRequested = ref(false)

/**
 * This post's own base path, and the frame computed from it. `blog.vue` yields
 * once a section is open, so this level draws the panel only then — the same
 * index/pair split every other editor uses.
 */
const postPath = computed(() => `${props.backUrl}/${persistedPostId.value}`)
const frame = useEditorFrame(postPath)
const section = computed<SettingsSection | null>(() => {
  const segment = frame.childSegment.value
  return segment && (SETTINGS_SECTIONS as string[]).includes(segment) ? segment as SettingsSection : null
})

const form = reactive({ title: '', collection: 'blog' as ArticleCollection, category: '', excerpt: '', seo_title: '', seo_description: '', slug: '', canonical_url: '', robots: '', visibility: 'public' as 'public' | 'unlisted', scheduled_for: '', redirect_old_slug: true })
const tagsText = ref('')
const publishTiming = ref<'Now' | 'Scheduled'>('Now')
const templateName = computed(() => post.value?.editor_template || 'saya')
const isPlatformTemplate = computed(() => templateName.value === 'platform')
const collectionOptions = ARTICLE_COLLECTION_SLUGS.map(slug => ({ label: ARTICLE_COLLECTIONS[slug].label, value: slug }))
const collectionCategories = computed(() => articleCollectionCategories(form.collection))
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
const statusLabel = computed(() => {
  if (!post.value) return 'Not published'
  if (post.value.status === 'scheduled') return 'Scheduled'
  if (post.value.status === 'draft') return 'Draft'
  return 'Published'
})
const lifecycleLabel = computed(() => publishing.value ? 'Publishing…' : statusLabel.value)
const generatedSlug = computed(() => normalizeBlogSlug(form.title))
const resolvedExcerpt = computed(() => generatedExcerpt(blocks.value))
const resolvedSiteName = computed(() => post.value?.editor_site_name || '')
const readMinutes = computed(() => Math.max(1, Math.ceil(serializeBody().trim().split(/\s+/).filter(Boolean).length / 200)))
const publicPath = computed(() => tenantBlogPostPath({ themeId: publicTemplateRegistry[templateName.value].themeId }, slugResetRequested.value ? generatedSlug.value : form.slug || generatedSlug.value, form.category, form.collection))
const resolvedSeo = computed(() => resolveBlogSeo({ title: form.title, seoTitle: form.seo_title, excerpt: form.excerpt || resolvedExcerpt.value, seoDescription: form.seo_description, slug: form.slug || generatedSlug.value, canonicalUrl: form.canonical_url, baseUrl: windowOrigin(), publicPath: publicPath.value, siteName: resolvedSiteName.value, robots: form.robots }))
/**
 * The post's cover is its leading image block and nothing else. The post's
 * images are one set; the cover is the lead one; the share card derives from
 * it. There is no separate "photo" that could hold the same picture twice.
 */
const coverMedia = computed(() => {
  const lead = blocks.value[0]
  return lead?.type === 'image' ? lead.media?.find(item => item.slot === 'media') ?? null : null
})
const resolvedPrimaryImageUrl = computed<string | null>(() =>
  coverMedia.value?.kind === 'video' ? null : resolveSocialImageUrl(coverMedia.value))
/**
 * The settings index. Every row states what it currently holds, so the pane is
 * read by scanning values rather than by opening each leaf to find out — which
 * is the whole reason an index beats a stack of collapsed cards.
 *
 * `placeholder` renders the summary as absent rather than as a value, so an
 * empty Category reads as "Not set" in italics instead of looking like content.
 */
const settingsGroups = computed<EditorNavigationGroup[]>(() => {
  const unset = (value: string | null | undefined) => !value || !String(value).trim()
  const row = (id: SettingsSection, label: string, value: string | null | undefined, fallback = 'Not set') => ({
    id,
    label,
    to: `${postPath.value}/${id}`,
    summary: unset(value) ? fallback : String(value),
    placeholder: unset(value),
  })
  return [
    {
      id: 'about',
      label: 'About this post',
      items: [
        row('category', isPlatformTemplate.value ? `${ARTICLE_COLLECTIONS[form.collection].label} · Category` : 'Category', form.category),
        row('tags', 'Tags', tagsText.value, 'None'),
        {
          id: 'excerpt',
          label: 'Excerpt',
          to: `${postPath.value}/excerpt`,
          summary: form.excerpt.trim() || resolvedExcerpt.value,
          placeholder: !form.excerpt.trim(),
        },
      ],
    },
    {
      id: 'publishing',
      label: 'Publishing',
      items: [
        { id: 'publishing', to: `${postPath.value}/publishing`, label: 'When it goes live', summary: publishingSummary.value },
        row('url', 'URL', form.slug || generatedSlug.value, 'Generated from the headline'),
      ],
    },
    {
      id: 'search',
      label: 'Search & sharing',
      items: [
        { id: 'search', to: `${postPath.value}/search`, label: 'Search appearance', summary: resolvedSeo.value.title },
        {
          id: 'share',
          label: 'Share preview',
          to: `${postPath.value}/share`,
          summary: resolvedPrimaryImageUrl.value || resolvedPrimaryVideoUrl.value ? 'Set' : 'No image yet',
          placeholder: !resolvedPrimaryImageUrl.value && !resolvedPrimaryVideoUrl.value,
        },
        row('canonical', 'Canonical URL', form.canonical_url, resolvedSeo.value.canonicalUrl),
        row('robots', 'Robots', form.robots, 'index, follow'),
      ],
    },
  ]
})

const publishingSummary = computed(() => {
  const visibility = form.visibility === 'unlisted' ? 'Unlisted' : 'Public'
  if (post.value?.status === 'published') return `Published · ${visibility}`
  if (publishTiming.value === 'Scheduled') {
    return form.scheduled_for ? `Scheduled ${form.scheduled_for.replace('T', ' ')} UTC · ${visibility}` : `Scheduled · ${visibility}`
  }
  return `${statusLabel.value} · ${visibility}`
})

const sectionLabel = computed(() => {
  for (const group of settingsGroups.value) {
    const match = group.items.find(item => item.id === section.value)
    if (match) return match.label
  }
  return 'Post settings'
})

const resolvedPrimaryVideoUrl = computed<string | null>(() => {
  const candidate = coverMedia.value?.kind === 'video' ? coverMedia.value.public_url : null
  return typeof candidate === 'string' && candidate ? candidate : null
})
const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…'
  if (saveState.value === 'failed') return 'Save failed'
  if (saveState.value === 'conflict') return 'Conflict — reload to reconcile'
  return dirtyState.value ? 'Unsaved changes' : 'Saved'
})
type InserterBlockType = 'image' | 'faq' | 'how_to' | 'cta' | 'divider'

type SaveSnapshot = { postId: string; payload: BlogPostUpdateInput }
const saveQueue = new SerializedSnapshotQueue<SaveSnapshot, BlogPost>(
  async (snapshot) => {
    const updated = await props.repository.update(snapshot.postId, {
      ...snapshot.payload,
      expected_updated_at: serverPostUpdatedAt,
    })
    syncServerVersion(updated)
    return updated
  },
  (updated) => {
    applyingServerSnapshot = true
    post.value = updated
    form.slug = updated.slug || form.slug
    slugResetRequested.value = false
    if (updated.content_document?.blocks) blocks.value = structuredClone(updated.content_document.blocks)
    contentDirty.value = false
    saveState.value = 'saved'
    void nextTick(() => { applyingServerSnapshot = false })
  },
)

/**
 * Autosave watches the canvas and only the canvas — the headline and the body,
 * the two things typed into the article itself.
 *
 * It used to watch every settings field as well, which quietly made each leaf's
 * Cancel button a lie: the value was already persisted by the time it was
 * pressed. A canvas autosaves because you cannot cancel an hour of writing; a
 * field describing the post commits on Save and reverts on Cancel, the way it
 * does in every other editor.
 */
watch([() => form.title, blocks], () => {
  if (applyingServerSnapshot) return
  markContentDirty()
  if (post.value && !loadPending.value && saveState.value !== 'conflict') {
    saveQueue.mark(buildSaveSnapshot())
    scheduleAutosave()
  }
}, { deep: true, flush: 'sync' })
watch([() => form.scheduled_for, publishTiming], () => {
  if (applyingServerSnapshot) return
  markLifecycleDirty()
}, { flush: 'sync' })
onMounted(async () => {
  interactive.value = true
  window.addEventListener('beforeunload', beforeUnload)
  if (!props.initialPost && !props.deferLoad) await load()
})
onBeforeUnmount(() => { cancelScheduledAutosave(); if (import.meta.client) { window.removeEventListener('beforeunload', beforeUnload) } })

async function load() {
  if (!postId.value || !props.isEdit) { loadPending.value = false; return }
  try {
    const loaded = await props.repository.get(postId.value)
    applyLoadedPost(loaded)
  } catch (error) { loadError.value = getErrorMessage(error, 'Failed to load post.') } finally { loadPending.value = false }
}
function applyLoadedPost(loaded: BlogPost) {
  applyingServerSnapshot = true
  try {
    syncServerVersion(loaded)
    post.value = loaded
    Object.assign(form, { title: loaded.title, collection: loaded.collection ?? 'blog', category: loaded.category || '', excerpt: loaded.excerpt || '', seo_title: loaded.seo_title || '', seo_description: loaded.seo_description || '', slug: loaded.slug || '', canonical_url: loaded.canonical_url || '', robots: loaded.robots || '', visibility: loaded.visibility || 'public', scheduled_for: toLocalDatetime(loaded.scheduled_for), redirect_old_slug: true })
    slugResetRequested.value = false
    tagsText.value = loaded.tags?.join(', ') || ''
    publishTiming.value = loaded.scheduled_for ? 'Scheduled' : 'Now'
    if (!loaded.content_document) throw new Error('Blog content document is missing')
    blocks.value = structuredClone(loaded.content_document.blocks || [])
    ensureTrailingTextBlock()
    contentDirty.value = false
    lifecycleDirty.value = false
  } finally {
    void nextTick(() => { applyingServerSnapshot = false })
  }
}
watch(() => props.initialPost, (loaded) => {
  if (!loaded) return
  try {
    applyLoadedPost(loaded)
    loadError.value = ''
  } catch (error) {
    loadError.value = getErrorMessage(error, 'Failed to load post.')
  } finally {
    loadPending.value = false
  }
}, { immediate: true })
function markContentDirty() {
  if (loadPending.value || saveState.value === 'conflict') return
  contentDirty.value = true
}
function markLifecycleDirty() {
  if (loadPending.value || saveState.value === 'conflict') return
  lifecycleDirty.value = true
}
/**
 * Marking the queue is not saving it. The header's "Save live changes" button
 * used to be the only thing that flushed a body edit, and removing that button
 * left the canvas marking itself dirty forever — it is supposed to autosave,
 * so it does it here rather than waiting for a control that no longer exists.
 *
 * The write is debounced so a burst of typing is one request, and its failure
 * is already reported by `saveState`, which is why the rejection is swallowed.
 */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave() {
  if (!import.meta.client) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    void flushSave().catch(() => {})
  }, 1200)
}
function cancelScheduledAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = null
}
async function flushSave() {
  if (!contentDirty.value) return post.value
  if (!post.value) return null
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
/** Opens the article with an empty image block; choosing its picture makes it the cover. */
function addCover() {
  blocks.value.unshift({ type: 'image', data: { caption: '' }, media: [] })
}
function buildSaveSnapshot(id = persistedPostId.value): SaveSnapshot {
  return { postId: id, payload: { title: form.title, collection: form.collection, category: form.category || null, tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean), excerpt: form.excerpt || null, seo_title: form.seo_title || null, seo_description: form.seo_description || null, slug: slugResetRequested.value ? null : form.slug !== post.value?.slug ? form.slug : undefined, reset_slug_override: slugResetRequested.value || undefined, redirect_old_slug: form.redirect_old_slug, canonical_url: form.canonical_url || null, robots: form.robots || null, visibility: form.visibility, content_blocks: cloneEditorBlocks(toRaw(blocks.value)) } }
}
function lifecycleVersionInput() {
  if (!serverPostUpdatedAt) throw new Error('Blog lifecycle version is unavailable. Reload the editor.')
  return { expected_updated_at: serverPostUpdatedAt }
}
function applyLifecycle(lifecycle: BlogLifecycleState) {
  if (!post.value?.content_document) throw new Error('Blog content document is missing')
  applyingServerSnapshot = true
  post.value = {
    ...post.value,
    status: lifecycle.status,
    published_at: lifecycle.published_at,
    first_published_at: post.value.first_published_at ?? lifecycle.published_at,
    scheduled_for: lifecycle.scheduled_for,
    updated_at: lifecycle.updated_at,
    content_document: {
      ...post.value.content_document,
      document: {
        ...post.value.content_document.document,
        updated_at: lifecycle.updated_at,
      },
    },
  }
  serverPostUpdatedAt = lifecycle.updated_at
  form.scheduled_for = toLocalDatetime(lifecycle.scheduled_for)
  publishTiming.value = lifecycle.scheduled_for ? 'Scheduled' : 'Now'
  applyingServerSnapshot = false
}
function recordLifecycleError(error: unknown) {
  const status = Number((error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status)
  saveState.value = status === 409 ? 'conflict' : 'failed'
  actionError.value = getErrorMessage(error, 'Failed to change publishing status.')
}
/** Dismissing a leaf discards its draft, matching every other editor. */
async function cancelSection() {
  if (post.value) applyLoadedPost(post.value)
  await navigateTo(postPath.value)
}
async function saveSection() {
  if (!post.value || !persistedPostId.value) return
  actionError.value = ''
  savingExplicitly.value = true
  try {
    // A settings leaf is not watched by autosave, so nothing has marked the
    // draft dirty. Saying so here is what lets `flushSave` write it.
    markContentDirty()
    saveQueue.mark(buildSaveSnapshot())
    await flushSave()
    // The publishing leaf's Save is what commits the lifecycle. A post that is
    // already live has nothing left to schedule, so only an unpublished one
    // goes through the lifecycle endpoint.
    if (section.value === 'publishing' && post.value.status !== 'published') {
      await publish()
      // Stay on the leaf when it failed, so the reason is still on screen.
      if (actionError.value) return
    }
    await navigateTo(postPath.value)
  } catch (error: unknown) {
    actionError.value = getErrorMessage(error, 'Failed to save.')
  } finally {
    savingExplicitly.value = false
  }
}
async function publish() {
  actionError.value = ''
  publishing.value = true
  try {
    if (!isArticleValid()) throw new Error('Complete the title, article body, and category before publishing.')
    if (!post.value) {
      const created = await props.repository.create({
        title: form.title,
        slug: form.slug || undefined,
        content_blocks: cloneEditorBlocks(toRaw(blocks.value)),
        collection: form.collection,
        category: form.category || null,
        tags: tagsText.value.split(',').map(v => v.trim()).filter(Boolean),
        excerpt: form.excerpt || null,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        canonical_url: form.canonical_url || null,
        robots: form.robots || null,
        visibility: form.visibility,
        scheduled_for: scheduledLifecycleValue(publishTiming.value, form.scheduled_for, 'UTC'),
      })
      applyLoadedPost(created)
      contentDirty.value = false
      lifecycleDirty.value = false
      saveState.value = 'saved'
      await navigateTo(props.repository.editUrl(created.id), { replace: true })
      return
    }
    await saveQueue.runExclusive(async () => {
      const lifecycle = await props.repository.publish(persistedPostId.value, {
        ...lifecycleVersionInput(),
        scheduled_for: scheduledLifecycleValue(publishTiming.value, form.scheduled_for, 'UTC'),
      })
      applyLifecycle(lifecycle)
      return lifecycle
    })
    lifecycleDirty.value = false
    saveState.value = 'saved'
  } catch (error: unknown) {
    recordLifecycleError(error)
  } finally {
    publishing.value = false
  }
}
function isArticleValid() { return Boolean(form.title.trim() && serializeBody().trim() && (!isPlatformTemplate.value || form.category.trim())) }
function serializeBody() { return blocks.value.map(block => block.type === 'heading' ? `${'#'.repeat(Math.max(2, Math.min(6, block.level || 2)))} ${String(block.data.text || '')}` : block.type === 'markdown' ? String(block.data.markdown || '') : block.type === 'divider' ? '---' : `{{component type="${block.type}"}}`).filter(Boolean).join('\n\n') }
function updateBlock(index: number, block: BlogEditorBlock) { blocks.value[index] = block }
function setBlockData(index: number, key: string, value: unknown) { blocks.value[index] = { ...blocks.value[index]!, data: { ...blocks.value[index]!.data, [key]: value } } }
function handleInsertBlock(index: number, _cursorPosition: number) {
  const block = blocks.value[index]
  if (!block || (block.type !== 'markdown' && block.type !== 'heading')) return

  blocks.value.splice(index + 1, 0, { type: 'markdown', data: { markdown: '', editor_mode: 'rich' } })
}
// An image block's asset lives in the block's `media` array, never in `data` —
// the server rejects `data.asset_id` outright, so seeding those two keys made
// every freshly inserted image block unsavable. `changeImage` writes the chosen
// asset to `media`; only alt and caption belong here.
function structuralBlockData(type: string) {
  return type === 'faq' ? { source: 'page_qa' } : type === 'how_to' ? { steps: [{ text: '' }] } : type === 'image' ? { caption: '' } : type === 'cta' ? { title: '', description: null, label: null, url: null } : {}
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
function changeImage(index: number, value: unknown) {
  const asset = value && typeof value === 'object'
    ? value as { asset_id?: unknown; public_url?: unknown; thumbnail_url?: unknown; kind?: unknown; alt_text?: unknown }
    : null
  const assetId = typeof asset?.asset_id === 'string' ? asset.asset_id : ''
  const publicUrl = typeof asset?.public_url === 'string' ? asset.public_url : null
  const thumbnailUrl = typeof asset?.thumbnail_url === 'string' ? asset.thumbnail_url : null
  const altText = typeof asset?.alt_text === 'string' ? asset.alt_text : null
  blocks.value[index] = {
    ...blocks.value[index]!,
    media: assetId ? [{ asset_id: assetId, slot: 'media', public_url: publicUrl, thumbnail_url: thumbnailUrl, kind: typeof asset?.kind === 'string' ? asset.kind : 'image', alt_text: altText }] : [],
  }
}

function beforeUnload(event: BeforeUnloadEvent) { if (dirtyState.value) event.preventDefault() }
function windowOrigin() { return import.meta.client ? window.location.origin : 'https://krabiclaw.com' }
function toLocalDatetime(value?: string | null) { if (!value) return ''; return instantDate(value).toISOString().slice(0, -1) }
function resetSlugOverride() { slugResetRequested.value = true; form.slug = generatedSlug.value }
function syncServerVersion(value: BlogPost) { serverPostUpdatedAt = value.updated_at }

onBeforeRouteLeave(async () => {
  if (dirtyState.value) return confirm('You have unsaved changes. Leave without saving them?')
  return true
})
</script>

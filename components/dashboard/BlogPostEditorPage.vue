<template>
  <UAlert
    v-if="loadError"
    color="error"
    variant="soft"
    icon="i-lucide-triangle-alert"
    title="Post could not be loaded"
    :description="loadError"
  />

  <BlogPostEditor
    v-else
    :repository="repository"
    :initial-post="postResource?.post ?? null"
    defer-load
    :site-id="siteId"
    :back-url="blogPath"
    back-label="Blog"
    panel-id="site-blog-post"
    :is-edit="true"
    :media-picker-component="MediaPicker"
  >
    <template #actions>
      <DashboardResourceLocalization
        :site-id="siteId"
        resource-type="content_document"
        :resource-id="postId"
        resource-label="post"
        :fields="blogLocalizationFields"
        :load-values="loadBlogLocalization"
        :save-values="saveBlogLocalization"
        :language-settings-path="siteLocalizationSettingsPath"
      />
    </template>
  </BlogPostEditor>
</template>

<script setup lang="ts">
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { tenantBlogRepository } from '~/lib/components/workspace/blog/tenantBlogRepository'
import { isBlogPostResponse } from '~/lib/components/workspace/blog/blog-response-contracts'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { BlogEditorBlock, BlogPost } from '~/lib/components/workspace/blog/types'
import { blankBlogLocalizedText, blogLocalizedTextFields, writeBlogLocalizedText, type BlogLocalizedFieldPath } from '~/utils/blog-editor'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { publicTemplateRegistry } from '~/utils/template-registry'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

// One post. Rendered by `blog.vue`, which owns the frame — this level draws its
// own panel and navbar because it is the outermost level on screen.
const route = useRoute()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const siteId = await useDashboardSiteId()
const postId = String(route.params.postId || '')
if (!postId) throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })

const blogPath = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`
const siteLocalizationSettingsPath = `/dashboard/${orgSlug}/sites/${siteSlug}/settings/localization`

const requestEvent = useRequestEvent()
const { data: postResource, error: postError } = await useAsyncData(
  `dashboard-blog-post:${siteId}:${postId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardBlogPost } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardBlogPost(requestEvent, siteId, postId)
    }
    return await dashboardFetch<{ post: BlogPost }>(
      `/api/editor/sites/${siteId}/blog/${postId}`,
      { orgSlug, siteSlug },
      { validate: isBlogPostResponse },
    )
  },
  { lazy: import.meta.client },
)

// A post that is not there is not a page. A request that failed is a state this
// surface shows, because the post may well still exist.
watchEffect(() => {
  if (postError.value && isNotFoundError(postError.value)) {
    showError(createError({ statusCode: 404, statusMessage: 'Post not found' }))
  }
})
const loadError = computed(() => (postError.value && !isNotFoundError(postError.value)
  ? getErrorMessage(postError.value, 'Failed to load this post')
  : null))

const repository = tenantBlogRepository({ siteId, orgSlug, siteSlug })

const dashboardApi = useDashboardApi()
type BlogTranslationResponse = { localization: Record<string, unknown> & { metadata: Record<string, unknown>; updated_at: string; content_blocks: BlogEditorBlock[] } }
interface BlogLocalizationState {
  locale: string
  blocks: BlogEditorBlock[]
  documentUpdatedAt: string | null
}
let blogLocalizationState: BlogLocalizationState | null = null
let blogLocalizationLoadGeneration = 0

function isBlogTranslationResponse(value: unknown): value is BlogTranslationResponse {
  return isRecord(value) && isRecord(value.localization) && typeof value.localization.updated_at === 'string'
    && isRecord(value.localization.metadata) && Array.isArray(value.localization.content_blocks)
}

function blogBlockFieldKey(blockIndex: number, path: BlogLocalizedFieldPath): string {
  return `content:${blockIndex}:${path.join('.')}`
}

const sourceBlogBlocks = computed(() => (postResource.value?.post.content_document?.blocks ?? []) as BlogEditorBlock[])
const blogLocalizationFields = computed(() => {
  const post = postResource.value?.post
  const fields: Array<{ key: string; label: string; source: string | readonly string[] | null | undefined; kind?: 'string-list'; multiline?: boolean; rows?: number }> = [
    { key: 'title', label: 'Title', source: post?.title },
    { key: 'summary', label: 'Excerpt', source: post?.excerpt, multiline: true, rows: 4 },
    { key: 'metadata.category', label: 'Category', source: post?.category },
    { key: 'metadata.tags', label: 'Tags', source: post?.tags, kind: 'string-list' },
    { key: 'seo_keywords', label: 'Search keywords', source: post?.seo_keywords },
  ]
  sourceBlogBlocks.value.forEach((block, blockIndex) => {
    blogLocalizedTextFields(block).forEach((field) => {
      fields.push({
        key: blogBlockFieldKey(blockIndex, field.path),
        label: `Article ${blockIndex + 1} · ${field.label}`,
        source: field.value,
        multiline: true,
        rows: field.rows,
      })
    })
  })
  return fields
})

function blankTranslationBlocks(): BlogEditorBlock[] {
  return sourceBlogBlocks.value.map(blankBlogLocalizedText)
}

async function loadBlogLocalization(locale: string): Promise<Record<string, unknown>> {
  const generation = ++blogLocalizationLoadGeneration
  let blocks = blankTranslationBlocks()
  let documentUpdatedAt: string | null = null
  let values: Record<string, unknown> = {}
  try {
    const response = await dashboardApi<BlogTranslationResponse>(
      `/api/editor/sites/${siteId}/localization/content_document/${postId}/${encodeURIComponent(locale)}`,
      { validate: isBlogTranslationResponse },
    )
    values = { ...response.localization, 'metadata.category': response.localization.metadata.category,
      'metadata.tags': response.localization.metadata.tags }
    blocks = structuredClone(response.localization.content_blocks)
    documentUpdatedAt = response.localization.updated_at
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) throw cause
  }
  blocks.forEach((block, blockIndex) => {
    blogLocalizedTextFields(block).forEach((field) => {
      values[blogBlockFieldKey(blockIndex, field.path)] = field.value
    })
  })
  if (generation !== blogLocalizationLoadGeneration) return {}
  blogLocalizationState = { locale, blocks, documentUpdatedAt }
  return values
}

async function saveBlogLocalization(locale: string, submitted: Record<string, unknown>): Promise<void> {
  const state = blogLocalizationState
  if (!state || state.locale !== locale) throw new Error('Choose the language again before saving.')
  const blocks = structuredClone(state.blocks)
  sourceBlogBlocks.value.forEach((source, blockIndex) => {
    const translated = blocks[blockIndex]
    if (!translated) throw new Error('The translated article structure is incomplete.')
    blogLocalizedTextFields(source).forEach((field) => {
      const value = submitted[blogBlockFieldKey(blockIndex, field.path)]
      if (field.value.trim() && (typeof value !== 'string' || !value.trim())) {
        throw new Error(`Translate ${field.label.toLowerCase()} in article section ${blockIndex + 1} before saving.`)
      }
      if (typeof value === 'string') writeBlogLocalizedText(translated.data, field.path, value)
    })
  })
  const values: Record<string, unknown> = { metadata: { category: submitted['metadata.category'],
    tags: submitted['metadata.tags'] } }
  for (const key of ['title', 'summary', 'seo_keywords']) {
    if (Object.hasOwn(submitted, key)) values[key] = submitted[key]
  }
  const post = postResource.value?.post
  if (!post?.slug) throw new Error('Save the source post with a URL before localizing it.')
  const template: unknown = post.editor_template
  if (template !== 'saya' && template !== 'blawby' && template !== 'platform') throw new Error('Article template is missing or invalid.')
  const sourcePath = tenantBlogPostPath({ themeId: publicTemplateRegistry[template].themeId }, post.slug, post.collection ?? 'blog')
  const response = await dashboardApi<BlogTranslationResponse>(
    `/api/editor/sites/${siteId}/localization/content_document/${postId}/${encodeURIComponent(locale)}`,
    {
      method: 'PUT',
      body: {
        values,
        route_path: `/${locale}${sourcePath}`,
        content_blocks: blocks,
        ...(state.documentUpdatedAt ? { expected_updated_at: state.documentUpdatedAt } : {}),
      },
      validate: isBlogTranslationResponse,
    },
  )
  blogLocalizationState = {
    locale,
    blocks: structuredClone(response.localization.content_blocks),
    documentUpdatedAt: response.localization.updated_at,
  }
}

useSeoMeta({ title: 'Edit Post | Dashboard' })
</script>

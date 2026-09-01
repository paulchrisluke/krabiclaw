<template>
  <UAlert
    v-if="postError"
    color="error"
    variant="soft"
    title="Post could not be loaded"
    :description="postError.message"
  />
  <BlogPostEditor
    v-else
    :repository="repository"
    :initial-post="postResource?.post ?? null"
    defer-load
    :site-id="siteId"
    title="Edit Post"
    :back-url="baseUrl"
    back-label="Blog"
    :is-edit="true"
    :media-picker-component="MediaPicker"
    :free-text-category="true"
  />
  <div v-if="!postError && translationLocales.length" class="mx-auto mt-6 max-w-3xl space-y-3 rounded-lg border border-default p-5">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-sm font-semibold">Translations</h2>
      <select v-model="translationLocale" aria-label="Field language" class="rounded-lg border border-default bg-default px-2 py-1 text-sm">
        <option value="en">en</option>
        <option v-for="option in translationLocales" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>
    <template v-if="translationLocale !== 'en'">
      <p class="text-xs text-muted">Source (English): {{ postResource?.post.title }}</p>
      <label class="block text-sm">Title ({{ translationLocale }})<input v-model="translationFields.title" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2"></label>
      <label class="block text-sm">Excerpt ({{ translationLocale }})<textarea v-model="translationFields.excerpt" :rows="4" class="mt-1 w-full rounded-lg border border-default bg-default px-3 py-2" /></label>
      <p v-if="translationError" class="text-sm text-error">{{ translationError }}</p>
      <button type="button" class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="translationSaving" @click="saveTranslation">
        {{ translationSaving ? 'Saving…' : 'Save translation' }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { tenantBlogRepository } from '~/lib/components/workspace/blog/tenantBlogRepository'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { BlogPost } from '~/lib/components/workspace/blog/types'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.blog' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const siteId = await useDashboardSiteId()
const postId = String(route.params.postId || '')
if (!postId) throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })

const isPostResponse = (value: unknown): value is { post: BlogPost } =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && typeof value.post.title === 'string'
  && isRecord(value.post.content_document)
  && Array.isArray(value.post.content_document.blocks)

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
      { validate: isPostResponse },
    )
  },
  { lazy: import.meta.client },
)

const repository = tenantBlogRepository({
  siteId,
  orgSlug,
  siteSlug,
})

const baseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`

useSeoMeta({ title: 'Edit Post | Dashboard' })

// ── Translations (resource_localizations, same API as the editor CRUD) ──
const dashboardApi = useDashboardApi()
const toast = useToast()
const translationLocale = ref('en')
const translationLocales = ref<string[]>([])
const translationFields = reactive({ title: '', excerpt: '' })
const translationError = ref<string | null>(null)
const translationSaving = ref(false)
function isBlogLocalesResponse(value: unknown): value is { languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> } {
  return isRecord(value) && Array.isArray(value.languages)
}
async function loadTranslationLocales() {
  try {
    const response = await dashboardApi<{ languages: Array<{ locale: string; locale_status: string; is_source: boolean | number }> }>(
      `/api/editor/sites/${siteId}/locales`,
      { validate: isBlogLocalesResponse },
    )
    translationLocales.value = response.languages.filter(item => item.locale_status === 'published' && !item.is_source).map(item => item.locale)
  } catch { translationLocales.value = [] }
}
function isBlogTranslationResponse(value: unknown): value is { localization: { values: Record<string, unknown> } } {
  return isRecord(value) && isRecord(value.localization) && isRecord(value.localization.values)
}
async function loadTranslationFields() {
  translationError.value = null
  try {
    const response = await dashboardApi<{ localization: { values: Record<string, unknown> } }>(
      `/api/editor/sites/${siteId}/localization/tenant_blog_post/${postId}/${encodeURIComponent(translationLocale.value)}`,
      { validate: isBlogTranslationResponse },
    )
    const values = response.localization.values
    translationFields.title = typeof values.title === 'string' ? values.title : ''
    translationFields.excerpt = typeof values.excerpt === 'string' ? values.excerpt : ''
  } catch (cause) {
    const statusCode = isRecord(cause) && typeof cause.statusCode === 'number' ? cause.statusCode : null
    if (statusCode !== 404) translationError.value = cause instanceof Error ? cause.message : 'Failed to load translation'
    translationFields.title = ''; translationFields.excerpt = ''
  }
}
watch(translationLocale, () => { if (translationLocale.value !== 'en') void loadTranslationFields() })
async function saveTranslation() {
  if (translationLocale.value === 'en') return
  translationSaving.value = true; translationError.value = null
  try {
    const values: Record<string, string> = {}
    if (translationFields.title.trim()) values.title = translationFields.title.trim()
    if (translationFields.excerpt.trim()) values.excerpt = translationFields.excerpt.trim()
    const slug = String(postResource.value?.post.slug ?? '')
    await dashboardApi(`/api/editor/sites/${siteId}/localization/tenant_blog_post/${postId}/${encodeURIComponent(translationLocale.value)}`, {
      method: 'PUT',
      body: { values, route_path: `/${translationLocale.value}/blog/${slug}` },
      validate: isRecord,
    })
    toast.add({ description: 'Translation saved', color: 'success' })
  } catch (cause) {
    translationError.value = cause instanceof Error ? cause.message : 'Failed to save translation'
  } finally {
    translationSaving.value = false
  }
}
void loadTranslationLocales()
</script>

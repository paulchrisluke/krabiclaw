<template>
  <!-- A post: its rows are the things it holds, each a leaf below this level. -->
  <DashboardIndexPanel id="location-post" :title="isNew ? 'New post' : editor.form.title || 'Post'" :auto-open="navigationGroups[0]?.items.find(item => item.to)?.to ?? null">
    <template v-if="post" #right>
      <DashboardResourceLocalization
        :organization-id="organizationId"
        resource-type="content_document"
        :resource-id="postId"
        resource-label="post"
        :fields="postLocalizationFields"
        :route-path="localizedPostPath"
        :language-settings-path="organizationLocalizationSettingsPath"
      />
    </template>

    <UAlert v-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Post could not be loaded" :description="loadError" />
    <template v-else>
      <div v-if="isNew" class="mb-6 flex justify-end">
        <UButton :label="createActionLabel" :loading="editor.saving.value" @click="startOrCreate" />
      </div>
      <!-- The post as a visitor will see it, before and after it is live. -->
      <div v-if="post" class="mb-6 flex flex-wrap items-center gap-2">
        <UBadge :color="post.status === 'published' ? 'success' : 'neutral'" variant="soft">{{ post.status === 'published' ? 'Live on the website' : 'Draft' }}</UBadge>
        <UButton v-if="viewUrl" :to="viewUrl" target="_blank" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link">
          {{ post.status === 'published' ? 'View post' : 'Preview' }}
        </UButton>
      </div>
      <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
    </template>
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'

export const SECTION_KEYS = ['photo', 'headline', 'body', 'action', 'publishing'] as const
export type SectionKey = typeof SECTION_KEYS[number]

/** The post's draft and what its leaves show or do beside their one field. */
export interface PostEditor {
  editor: ReturnType<typeof useLocationPostEditor>
  organizationId: string
  postId: ComputedRef<string>
  isNew: ComputedRef<boolean>
  post: ComputedRef<ApiRecord | null>
  sectionLabels: ComputedRef<Record<SectionKey, string>>
  saveLabel: Ref<string | undefined>
  saveDisabled: Ref<boolean>
  revert: () => void
  save: () => Promise<void>
}

export const postEditorKey = Symbol('post-editor') as InjectionKey<PostEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import { useLocationPostEditor } from '~/composables/useLocationPostEditor'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

const route = useRoute()
const dashboardApi = useDashboardApi()
const postId = computed(() => String(route.params.postId ?? ''))
const level = useRouteLevel()
const postPath = level.path

const organizationId = await useDashboardOrganizationId()
const dashboardLocation = useDashboardLocation()
const isNew = computed(() => postId.value === 'new')
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const editor = useLocationPostEditor(organizationId, currentLocationId)

const sectionLabels = computed<Record<SectionKey, string>>(() => ({
  photo: 'Photos and video',
  headline: 'Headline',
  body: 'Caption',
  action: 'Link button',
  publishing: 'Where it is published',
}))
const detailKey = computed(() => level.child.value)
const editorKey = computed<SectionKey>(() => (detailKey.value ?? (isNew.value ? 'body' : 'photo')) as SectionKey)

const isSinglePostResponse = (value: unknown): value is { post: ApiRecord } => isRecord(value) && isRecord(value.post) && typeof value.post.id === 'string'
const { data, error } = await useAsyncData(
  computed(() => `dashboard-location-post:${organizationId}:${postId.value}`),
  async () => isNew.value ? null : await dashboardApi<{ post: ApiRecord }>(`/api/editor/organizations/${organizationId}/posts/${postId.value}`, { validate: isSinglePostResponse }),
  { watch: [postId] },
)
watchEffect(() => {
  if (isNotFoundError(error.value)) showError(createError({ statusCode: 404, statusMessage: 'Post not found' }))
})
const loadError = computed(() => (error.value && !isNotFoundError(error.value) ? getErrorMessage(error.value, 'Failed to load the post') : null))
// The record as the editor last read it: a save or publish reads it again.
watch(() => data.value?.post ?? null, value => { if (value) editor.loadFrom(value) }, { immediate: true })
const post = computed(() => editor.record.value)

// ── The new post's draft ────────────────────────────────
/**
 * A half-written new post survives the walk between its own sections, which
 * remount this component, and carries the idempotency key its creation is sent
 * under, so a double press or a retried request makes one post.
 */
const blankDraft = () => ({ location_id: currentLocationId.value, title: '', body: '', idempotency_key: crypto.randomUUID() })
const draft = useState(`location-post-draft-${organizationId}-${postId.value}`, blankDraft)
if (isNew.value) {
  if (draft.value.location_id !== currentLocationId.value) draft.value = blankDraft()
  editor.form.title = draft.value.title
  editor.form.body = draft.value.body
  watch(() => editor.form.body, value => { draft.value.body = value }, { flush: 'sync' })
  watch(() => editor.form.title, value => { draft.value.title = value }, { flush: 'sync' })
}

// ── The index ─────────────────────────────────────────────
function mediaSummary(): string {
  const count = editor.form.media.length
  return count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'No photos or video'
}

function publishingSummary(): string {
  const record = post.value
  if (!record) return 'Website'
  const parts = [record.status === 'published' ? 'Website' : 'Not on the website yet']
  for (const publication of Array.isArray(record.publications) ? record.publications as ApiRecord[] : []) {
    const name = publication.channel === 'facebook' ? 'Facebook' : 'Instagram'
    parts.push(`${name}: ${String(publication.state)}`)
  }
  return parts.join(' · ')
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => {
  const body = { id: 'body', label: 'Caption', summary: editor.form.body || 'No caption', placeholder: !editor.form.body, to: `${postPath.value}/body` }
  if (isNew.value) return [{ id: 'new-post', label: 'New post', items: [body] }]
  const action = editor.form.callToAction
  return [
    { id: 'content', label: 'Content', items: [
      { id: 'photo', label: 'Photos and video', summary: mediaSummary(), placeholder: !editor.form.media.length, to: `${postPath.value}/photo` },
      { id: 'headline', label: 'Headline', summary: editor.form.title || 'No headline', placeholder: !editor.form.title, to: `${postPath.value}/headline` },
      body,
      { id: 'action', label: 'Link button', summary: action ? `${action.label} → ${action.url}` : 'No button', placeholder: !action, to: `${postPath.value}/action` },
    ] },
    { id: 'publishing', label: 'Publishing', items: [
      { id: 'publishing', label: 'Where it is published', summary: publishingSummary(), to: `${postPath.value}/publishing` },
    ] },
  ]
})
const openSections = computed(() => navigationGroups.value.flatMap(group => group.items.map(item => item.id)))
watchEffect(() => {
  if (!isNew.value && !post.value) return
  if (detailKey.value && !openSections.value.includes(detailKey.value)) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})

// ── Save / cancel ───────────────────────────────────────
const sectionValid = computed(() => {
  if (editorKey.value !== 'action') return true
  const action = editor.form.callToAction
  return !action || (Boolean(action.label.trim()) && Boolean(action.url.trim()))
})
const { createActionLabel, saveLabel, saveDisabled, save: saveCurrentEditor, startOrCreate } = useCreateWalk<SectionKey>({
  recordPath: postPath,
  isNew,
  openKey: editorKey,
  labels: sectionLabels,
  // A draft may be empty: nothing is required to create one.
  order: ['body'],
  missing: () => false,
  noun: 'post',
  saving: editor.saving,
  existingBlocked: () => !sectionValid.value,
  commit,
})

async function commit() {
  if (isNew.value) {
    const created = await editor.save(null, draft.value.idempotency_key)
    if (!created?.id) return
    await navigateTo(`${level.to.value}/${String(created.id)}`, { replace: true })
    draft.value = blankDraft()
    return
  }
  if (await editor.save(postId.value)) await level.close()
}

function revert() {
  if (post.value) editor.loadFrom(post.value)
}

const viewUrl = computed(() => {
  const record = post.value
  if (!record) return null
  // Both are absolute on the site's own domain; the dashboard is another host.
  return record.status === 'published' ? record.canonical_url : record.preview_url
})

const organizationLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/settings/website/localization`)
const postLocalizationFields = computed(() => [
  { key: 'title', label: 'Title', source: post.value?.title },
  { key: 'summary', label: 'Caption', source: post.value?.body, multiline: true, rows: 6 },
  ...(isRecord(post.value?.call_to_action) ? [{ key: 'metadata.call_to_action.label', label: 'Link button label', source: post.value.call_to_action.label }] : []),
])
function localizedPostPath(locale: string): string {
  const slug = post.value?.slug
  if (typeof slug !== 'string' || !slug) throw new Error('The post slug is unavailable.')
  return `/${locale}/posts/${slug}`
}

useSeoMeta({ title: () => `${isNew.value ? 'New post' : editor.form.title || 'Post'} | Krabiclaw Dashboard`, robots: 'noindex, nofollow' })
provide(postEditorKey, { editor, organizationId, postId, isNew, post, sectionLabels, saveLabel, saveDisabled, revert, save: saveCurrentEditor })
</script>

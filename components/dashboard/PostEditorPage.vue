<template>
  <!--
    With no section open this post is its parent's detail column, so it renders
    its rows and nothing else. It becomes the index column only once a section
    is open.
  -->
  <div v-if="frame.mode.value === 'index'" class="space-y-6">
    <UAlert
      v-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Post could not be loaded"
      :description="loadError"
    />
    <template v-else>
      <div v-if="isNew" class="flex justify-end">
        <UButton :label="createActionLabel" :loading="editor.saving.value" @click="startOrCreate" />
      </div>
      <EditorNavigationList :groups="navigationGroups" />
    </template>
  </div>

  <UDashboardPanel v-else id="location-post-detail">
    <template #header>
      <UDashboardNavbar :title="isNew ? 'New post' : editor.form.title || 'Post'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="postsPath" label="Posts" />
        </template>
        <template v-if="post" #right>
          <DashboardResourceLocalization
            :site-id="siteId"
            resource-type="content_document"
            :resource-id="postId"
            resource-label="post"
            :fields="postLocalizationFields"
            :route-path="localizedPostPath"
            :language-settings-path="siteLocalizationSettingsPath"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Post could not be loaded"
        :description="loadError"
      />

      <EditorPaneShell
        v-else
        has-detail
        :show-actions="editorKey !== 'photo'"
        :saving="editor.saving.value"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        :detail-title="sectionLabels[editorKey]"
        :dismiss-to="postPath"
        @cancel="cancelEditor"
        @save="saveCurrentEditor"
      >
        <template #index>
          <EditorNavigationList :groups="navigationGroups" :active-item="detailKey" />
        </template>

        <template #detail>
          <!--
            Post type. Only a post being created has it: the contract's shape
            is chosen by the type, so an existing post cannot change it.
          -->
          <UFormField v-if="editorKey === 'type'" label="What are you posting?">
            <URadioGroup
              :model-value="postType"
              :items="typeOptions"
              :ui="{ fieldset: 'flex flex-wrap gap-4' }"
              @update:model-value="setType(String($event))"
            />
          </UFormField>

          <!-- Photo -->
          <div v-else-if="editorKey === 'photo'" class="space-y-4">
            <p class="text-base text-muted">The picture this post is recognised by, in the list and on your site.</p>
            <PostMediaFields
              v-model:media="editor.form.media"
              :site-id="siteId"
              :supports-media="supportsMedia"
            />
            <p v-if="supportsMedia" class="text-sm text-muted">Media saves with the post.</p>
          </div>

          <!-- Headline -->
          <UFormField v-else-if="editorKey === 'headline'" label="Headline" description="Optional. Shown as the post's title on your site and in this list.">
            <UInput v-model="editor.form.title" size="xl" autofocus placeholder="Add a headline" class="w-full" />
          </UFormField>

          <!-- Body -->
          <UFormField v-else-if="editorKey === 'body'" label="Post" required>
            <UTextarea
              v-model="editor.form.body"
              :rows="10"
              autofocus
              placeholder="What's new? Write it the way you'd say it to a guest."
              size="xl"
              class="w-full"
            />
          </UFormField>

          <!-- Event schedule / offer period -->
          <div v-else-if="editorKey === 'schedule' && editor.form.topic.event" class="space-y-6">
            <p class="text-base text-muted">
              {{ isOffer ? 'When the offer starts and stops.' : 'When it happens, and whether it repeats.' }}
            </p>
            <PostScheduleFields v-model="editor.form.topic.event" :is-offer="isOffer" />
          </div>

          <!-- Offer details -->
          <div v-else-if="editorKey === 'offer' && editor.form.topic.offer" class="space-y-6">
            <p class="text-base text-muted">What a guest needs in order to claim it.</p>
            <UFormField label="Coupon code" description="Optional.">
              <UInput :model-value="editor.form.topic.offer.coupon_code ?? ''" class="w-full" @update:model-value="setOffer('coupon_code', String($event))" />
            </UFormField>
            <UFormField label="Link to redeem online" description="Optional.">
              <UInput :model-value="editor.form.topic.offer.redeem_online_url ?? ''" type="url" placeholder="https://" class="w-full" @update:model-value="setOffer('redeem_online_url', String($event))" />
            </UFormField>
            <UFormField label="Terms" description="Optional. Any restriction a guest should know before they arrive.">
              <UTextarea :model-value="editor.form.topic.offer.terms_conditions ?? ''" :rows="4" class="w-full" @update:model-value="setOffer('terms_conditions', String($event))" />
            </UFormField>
          </div>

          <!-- Call to action -->
          <div v-else-if="editorKey === 'action'" class="space-y-6">
            <p class="text-base text-muted">The button a guest sees under the post.</p>
            <UFormField label="Button">
              <USelect
                :model-value="editor.form.topic.call_to_action?.action_type ?? 'none'"
                :items="actionOptions"
                value-key="value"
                label-key="label"
                class="w-full"
                @update:model-value="setAction(String($event))"
              />
            </UFormField>
            <p v-if="editor.form.topic.call_to_action?.action_type === 'call'" class="text-sm text-muted">
              Calls the phone number saved on this location.
            </p>
            <UFormField v-else-if="editor.form.topic.call_to_action" label="Where it goes" required>
              <UInput v-model="editor.form.topic.call_to_action.url" type="url" placeholder="https://" class="w-full" />
            </UFormField>
          </div>

          <!-- Publishing -->
          <div v-else-if="editorKey === 'publishing'" class="space-y-6">
            <p v-if="postStatus === 'published'" class="text-base text-muted">
              This post is already live, so it no longer has a publishing time to set.
            </p>
            <template v-else>
              <p class="text-base text-muted">When this post goes live on your site.</p>
              <UFormField label="When">
                <USelect
                  :model-value="editor.form.topic.scheduled_for ? 'later' : 'now'"
                  :items="TIMING_OPTIONS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  @update:model-value="setTiming(String($event))"
                />
              </UFormField>
              <UFormField v-if="editor.form.topic.scheduled_for" label="Goes live (UTC)" required description="Must be in the future.">
                <UInput
                  :model-value="instantDate(editor.form.topic.scheduled_for).toISOString().slice(0, -1)"
                  type="datetime-local"
                  step="any"
                  class="w-full"
                  @update:model-value="editor.form.topic.scheduled_for = $event ? scheduledLifecycleValue('Scheduled', String($event), 'UTC') : null"
                />
              </UFormField>
            </template>

            <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
              <UButton :loading="editor.publishing.value" label="Publish…" @click="openPublish" />
              <UButton v-if="publicPath" :to="publicPath" target="_blank" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link">
                View public post
              </UButton>
            </div>
          </div>

          <!--
            A real section that this post type does not have — /offer on an
            update, say. Named rather than left as a blank pane with a live Save.
          -->
          <p v-else class="text-base text-muted">
            {{ typeLabel }} posts have no {{ sectionLabels[editorKey].toLowerCase() }}.
          </p>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <!--
    Where the post goes out is a separate decision from what it says, so it is
    its own step rather than a set of checkboxes inside the form.
  -->
  <DashboardListItemDialog
    v-model:open="publishOpen"
    title="Publish this post"
    :removable="false"
    :saving="editor.publishing.value"
    :save-disabled="!editor.selectedChannels.value.length"
    :save-label="editor.selectedChannels.value.length > 1 ? `Publish to ${editor.selectedChannels.value.length} channels` : 'Publish'"
    @save="onPublish"
  >
    <label
      v-for="channel in channelOptions"
      :key="channel.value"
      class="flex items-center gap-3 rounded-lg border border-default px-3 py-2 text-sm"
      :class="channel.disabled ? 'text-muted' : 'text-default'"
    >
      <UCheckbox
        :model-value="editor.selectedChannels.value.includes(channel.value)"
        :disabled="channel.disabled"
        @update:model-value="toggleChannel(channel.value, Boolean($event))"
      />
      <span class="min-w-0 flex-1 truncate">{{ channel.label }}</span>
      <span v-if="channel.hint" class="shrink-0 text-xs text-muted">{{ channel.hint }}</span>
    </label>
  </DashboardListItemDialog>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import DashboardResourceLocalization from '~/components/dashboard/DashboardResourceLocalization.vue'
import PostMediaFields from '~/components/dashboard/PostMediaFields.vue'
import PostScheduleFields from '~/components/dashboard/PostScheduleFields.vue'
import { useLocationPostEditor } from '~/composables/useLocationPostEditor'
import { instantDate, formatTimestamp } from '~/utils/timezone'
import { scheduledLifecycleValue } from '~/utils/blog-editor'
import { CREATABLE_POST_TYPES, POST_ACTIONS, postEventDescription, type PostMutation } from '~/shared/posts'
import {
  postActionComplete,
  postNeedsSchedule,
  postPublishingComplete,
  postScheduleComplete,
} from '~/utils/post-fields'
import { getErrorMessage, isNotFoundError } from '~/utils/errors'

const route = useRoute()
const dashboardApi = useDashboardApi()
const postId = computed(() => String(route.params.postId ?? ''))
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const postsPath = computed(() => `${locationPath.value}/posts`)
const postPath = computed(() => `${postsPath.value}/${postId.value}`)
const frame = useEditorFrame(postPath)

const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()
const isNew = computed(() => postId.value === 'new')

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const editor = useLocationPostEditor(siteId, currentLocationId)

const TYPE_LABELS: Record<string, string> = {
  standard: 'Update',
  event: 'Event',
  offer: 'Offer',
  alert: 'Alert',
}
const ACTION_LABELS: Record<string, string> = {
  book: 'Book',
  order: 'Order online',
  shop: 'Shop',
  learn_more: 'Learn more',
  sign_up: 'Sign up',
  call: 'Call us',
}
const TIMING_OPTIONS = [
  { value: 'now', label: 'Publish now' },
  { value: 'later', label: 'Schedule for later' },
]

// ── Which leaf is open ──────────────────────────────────
const SECTION_KEYS = ['type', 'photo', 'headline', 'body', 'schedule', 'offer', 'action', 'publishing'] as const
type SectionKey = typeof SECTION_KEYS[number]

/** Creating asks only for what the contract will not accept a post without. */
const NEW_SECTION_KEYS: readonly SectionKey[] = ['type', 'body', 'schedule']
const EXISTING_SECTION_KEYS: readonly SectionKey[] = SECTION_KEYS.filter(key => key !== 'type')

const sectionLabels = computed<Record<SectionKey, string>>(() => ({
  type: 'Post type',
  photo: 'Photo',
  headline: 'Headline',
  body: 'Post',
  schedule: isOffer.value ? 'Offer period' : 'Event schedule',
  offer: 'Offer details',
  action: 'Call to action',
  publishing: 'Publishing',
}))

const detailKey = computed(() => frame.childSegment.value)
const editorKey = computed<SectionKey>(() => (detailKey.value ?? (isNew.value ? 'type' : 'photo')) as SectionKey)

const openSections = computed(() => (isNew.value ? NEW_SECTION_KEYS : EXISTING_SECTION_KEYS))
// An unsupported route 404s rather than silently showing the first section.
if (frame.rest.value.length > 1 || (detailKey.value && !openSections.value.some(key => key === detailKey.value))) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

// ── The post ────────────────────────────────────────────
const isSinglePostResponse = (value: unknown): value is { post: ApiRecord } =>
  isRecord(value) && isRecord(value.post) && typeof value.post.id === 'string'
const isFacebookResponse = (value: unknown): value is { connected: boolean } =>
  isRecord(value) && typeof value.connected === 'boolean'

const { data, error } = await useAsyncData(
  computed(() => `dashboard-location-post:${siteId}:${postId.value}`),
  async () => isNew.value
    ? null
    : await dashboardApi<{ post: ApiRecord }>(`/api/editor/sites/${siteId}/posts/${postId.value}`, {
      validate: isSinglePostResponse,
    }),
  { watch: [postId] },
)

// Whether Facebook is connected only decides which publish channels are
// offered, so it is fetched apart from the post: an integrations outage must
// not hide the editor.
const { data: facebookData } = await useAsyncData(
  computed(() => `facebook-connection:${currentLocationId.value ?? 'missing'}`),
  () => dashboardApi<{ connected: boolean }>('/api/integrations/facebook-pages/connection', {
    query: { locationId: currentLocationId.value ?? '' },
    validate: isFacebookResponse,
  }),
  { lazy: true, default: () => ({ connected: false }) },
)

// A post that is not there is not a page; a request that failed is a state.
watchEffect(() => {
  if (isNotFoundError(error.value)) showError(createError({ statusCode: 404, statusMessage: 'Post not found' }))
})
const loadError = computed(() => (error.value && !isNotFoundError(error.value) ? getErrorMessage(error.value, 'Failed to load the post') : null))
const post = computed(() => data.value?.post ?? null)
const facebookConnected = computed(() => facebookData.value?.connected ?? false)

watch(post, value => { if (value) editor.loadFrom(value) }, { immediate: true })

// ── The new post's draft ────────────────────────────────
type NewPostType = typeof CREATABLE_POST_TYPES[number]
const TYPE_DESCRIPTIONS: Record<NewPostType, string> = {
  standard: 'News from the location.',
  event: 'Something at a set date and time.',
  offer: 'A deal that runs between two dates.',
}
const typeOptions: Array<{ value: string, label: string, description: string }> = CREATABLE_POST_TYPES.map(value => ({
  value,
  label: TYPE_LABELS[value] ?? value,
  description: TYPE_DESCRIPTIONS[value],
}))

/** The chosen type seeds the shape the contract expects for it. An offer carries
 *  its validity window in the same event shape an event uses. */
function seedTopic(type: NewPostType): PostMutation {
  return {
    post_type: type,
    event: type === 'standard'
      ? null
      : { title: '', schedule: { start_date: '', start_time: '', end_date: '', end_time: '' } },
    offer: type === 'offer' ? {} : null,
    call_to_action: null,
    alert_type: null,
    scheduled_for: null,
  }
}

/**
 * The draft outlives any one leaf. Moving between sections remounts this
 * component, so the editor's own `reactive` lost the body the moment you
 * navigated from Post to the event schedule. `useState` is keyed to the
 * record, so a half-written new post survives the walk between its own
 * sections and is discarded once the post exists.
 *
 * The draft carries the location it was written for rather than naming it in
 * the key, which is only read once during setup: keyed by location, a change in
 * the selector left the draft filed under the location it started in while the
 * commit went to the new one. It is the same entry either way, and it is reset
 * whenever it does not belong to the location now selected.
 */
const blankDraft = () => ({ location_id: currentLocationId.value, topic: seedTopic('standard'), body: '' })
const draft = useState(`location-post-draft-${siteId}-${postId.value}`, blankDraft)

if (isNew.value) {
  if (draft.value.location_id !== currentLocationId.value) draft.value = blankDraft()
  watch(currentLocationId, () => {
    if (draft.value.location_id === currentLocationId.value) return
    draft.value = blankDraft()
    editor.form.topic = draft.value.topic
    editor.form.body = draft.value.body
  })
  editor.form.topic = draft.value.topic
  editor.form.body = draft.value.body
  // Synchronous so the draft is already written when a commit navigates away
  // in the same tick as the last keystroke.
  watch(() => editor.form.topic, value => { draft.value.topic = value }, { deep: true, flush: 'sync' })
  watch(() => editor.form.body, value => { draft.value.body = value }, { flush: 'sync' })
}

function setType(value: string) {
  const type = CREATABLE_POST_TYPES.find(option => option === value)
  if (!type) return
  editor.form.topic = seedTopic(type)
}

const topic = computed(() => editor.form.topic)
const postType = computed(() => topic.value.post_type ?? 'standard')
const typeLabel = computed(() => TYPE_LABELS[postType.value] ?? 'Post')
const isOffer = computed(() => postType.value === 'offer')
// An alert's contract shape rejects media outright.
const supportsMedia = computed(() => postType.value !== 'alert')

const postStatus = computed(() => (post.value?.status === 'published' || post.value?.status === 'scheduled' ? post.value.status : null))

// ── The hub ─────────────────────────────────────────────
function coverPreview(): string[] | undefined {
  const cover = editor.form.media.find(item => item.slot === 'cover')
  const url = cover?.thumbnail_url
  return url ? [url] : undefined
}

function mediaSummary(): string {
  if (!supportsMedia.value) return 'Alerts carry no media'
  const count = editor.form.media.length
  return count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'No photo yet'
}

function scheduleSummary(): string {
  const event = topic.value.event
  if (!postScheduleComplete(event)) return isOffer.value ? 'Set when the offer runs' : 'Set when it happens'
  return `${event!.title} · ${postEventDescription(event!)}`
}

function offerSummary(): string {
  const offer = topic.value.offer
  if (!offer) return 'Add a code or terms'
  const parts: string[] = []
  if (offer.coupon_code) parts.push(`Code ${offer.coupon_code}`)
  if (offer.redeem_online_url) parts.push('Redeemable online')
  if (offer.terms_conditions) parts.push('Terms added')
  return parts.length ? parts.join(' · ') : 'Add a code or terms'
}

function actionSummary(): string {
  const action = topic.value.call_to_action
  if (!action) return 'No button'
  const label = ACTION_LABELS[action.action_type] ?? action.action_type
  return action.action_type === 'call' ? label : `${label} → ${action.url}`
}

function publishingSummary(): string {
  if (postStatus.value === 'published') return 'Live'
  const scheduled = topic.value.scheduled_for
  if (!scheduled) return 'Not scheduled'
  return `Goes live ${formatTimestamp(scheduled, 'en', 'UTC')} UTC`
}

const navigationGroups = computed<EditorNavigationGroup[]>(() => {
  // A post that does not exist yet shows only what creating it asks for.
  if (isNew.value) {
    const creating: EditorNavigationGroup['items'] = [
      { id: 'type', label: 'Post type', summary: typeLabel.value, to: `${postPath.value}/type` },
      {
        id: 'body',
        label: 'Post',
        summary: editor.form.body || 'Nothing written yet',
        placeholder: !editor.form.body,
        to: `${postPath.value}/body`,
      },
    ]
    if (postNeedsSchedule(topic.value)) {
      creating.push({
        id: 'schedule',
        label: sectionLabels.value.schedule,
        summary: scheduleSummary(),
        placeholder: !postScheduleComplete(topic.value.event),
        to: `${postPath.value}/schedule`,
      })
    }
    return [{ id: 'new-post', label: 'New post', items: creating }]
  }

  const content: EditorNavigationGroup['items'] = [
    {
      id: 'photo',
      label: supportsMedia.value ? 'Photo' : 'Media',
      summary: mediaSummary(),
      placeholder: !editor.form.media.length,
      to: `${postPath.value}/photo`,
      previews: coverPreview(),
    },
    {
      id: 'headline',
      label: 'Headline',
      summary: editor.form.title || 'No headline',
      placeholder: !editor.form.title,
      to: `${postPath.value}/headline`,
    },
    {
      id: 'body',
      label: 'Post',
      summary: editor.form.body || 'Nothing written yet',
      placeholder: !editor.form.body,
      to: `${postPath.value}/body`,
    },
  ]
  if (postNeedsSchedule(topic.value)) {
    content.push({
      id: 'schedule',
      label: sectionLabels.value.schedule,
      summary: scheduleSummary(),
      placeholder: !postScheduleComplete(topic.value.event),
      to: `${postPath.value}/schedule`,
    })
  }
  if (isOffer.value) {
    content.push({ id: 'offer', label: 'Offer details', summary: offerSummary(), to: `${postPath.value}/offer` })
  }
  // The contract forbids an action on an offer — the redeem link is the action
  // there — so the row is absent rather than present and inert.
  if (!isOffer.value) {
    content.push({ id: 'action', label: 'Call to action', summary: actionSummary(), placeholder: !topic.value.call_to_action, to: `${postPath.value}/action` })
  }
  return [
    { id: 'content', label: 'Content', items: content },
    {
      id: 'publishing',
      label: 'Publishing',
      items: [{ id: 'publishing', label: 'When it goes live', summary: publishingSummary(), to: `${postPath.value}/publishing` }],
    },
  ]
})

// ── Save / cancel ───────────────────────────────────────
const sectionValid = computed(() => {
  if (editorKey.value === 'body') return Boolean(editor.form.body.trim())
  if (editorKey.value === 'schedule') return postScheduleComplete(topic.value.event)
  if (editorKey.value === 'action') return postActionComplete(topic.value)
  if (editorKey.value === 'publishing') return postPublishingComplete(topic.value)
  return true
})

const { createActionLabel, saveLabel, saveDisabled, save: saveCurrentEditor, startOrCreate } = useCreateWalk<SectionKey>({
  recordPath: postPath,
  isNew,
  openKey: editorKey,
  labels: sectionLabels,
  // The type is chosen for you — a post is an update unless you say otherwise —
  // so it is walked past, and only visited when the owner opens it.
  order: ['type', 'body', 'schedule'],
  missing: (key) => {
    if (key === 'body') return !editor.form.body.trim()
    if (key === 'schedule') return postNeedsSchedule(topic.value) && !postScheduleComplete(topic.value.event)
    return false
  },
  noun: 'post',
  saving: editor.saving,
  existingBlocked: () => !sectionValid.value,
  commit,
})

async function commit() {
  if (isNew.value) {
    const created = await editor.save(null)
    if (!created?.id) return
    await navigateTo(`${postsPath.value}/${String(created.id)}`)
    // Once the post exists the draft is spent. Cleared after the navigation so
    // the watchers above, which stop with this component, cannot write it back.
    draft.value = blankDraft()
    return
  }
  if (await editor.save(postId.value)) await navigateTo(postPath.value)
}

/** Dismissing a leaf discards its draft, matching the settings sheets. */
async function cancelEditor() {
  if (post.value) editor.loadFrom(post.value)
  await navigateTo(postPath.value)
}

// ── Field writers ───────────────────────────────────────
const actionOptions = computed(() => [
  { value: 'none', label: 'No button' },
  ...POST_ACTIONS.map(value => ({ value, label: ACTION_LABELS[value] ?? value })),
])

function setOffer(field: 'coupon_code' | 'redeem_online_url' | 'terms_conditions', value: string) {
  const offer = topic.value.offer
  if (!offer) return
  // An empty field is an absent one: the contract's offer shape rejects a blank
  // string, so the key is dropped rather than written empty.
  topic.value.offer = Object.fromEntries(
    Object.entries({ ...offer, [field]: value.trim() }).filter(([, entry]) => entry),
  )
}

function setAction(value: string) {
  const action = POST_ACTIONS.find(item => item === value)
  topic.value.call_to_action = !action
    ? null
    : action === 'call'
      ? { action_type: action }
      : { action_type: action, url: '' }
}

function setTiming(value: string) {
  if (value === 'now') { topic.value.scheduled_for = null; return }
  // Seeded a day out rather than at "now", which is already in the past by the
  // time the section commits.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setSeconds(0, 0)
  topic.value.scheduled_for = tomorrow.toISOString()
}

// ── Publishing to channels ──────────────────────────────
// Instagram publishes from the cover asset and, as implemented, only accepts a
// photo, so a post without one is skipped server-side. Saying so here is the
// difference between a choice that cannot be made and one that silently does
// nothing.
const hasPhotoCover = computed(() => editor.form.media.some(item => item.slot === 'cover' && item.kind !== 'video'))

const channelOptions = computed(() => [
  { value: 'site', label: 'This website', disabled: false, hint: '' },
  {
    value: 'facebook',
    label: 'Facebook Page',
    disabled: !facebookConnected.value,
    hint: facebookConnected.value ? '' : 'Connect in Integrations',
  },
  {
    value: 'instagram',
    label: 'Instagram',
    disabled: !facebookConnected.value || !hasPhotoCover.value,
    hint: !facebookConnected.value
      ? 'Connect in Integrations'
      : hasPhotoCover.value ? '' : 'Needs a photo as the cover',
  },
])

const publishOpen = ref(false)

/** Publishing acts on a saved post, so pending edits are committed first —
 *  but an untouched post is already saved and must not be rewritten. */
async function openPublish() {
  if (editor.isDirty.value && !(await editor.save(postId.value))) return
  publishOpen.value = true
}

function toggleChannel(value: string, checked: boolean) {
  const selected = editor.selectedChannels.value
  editor.selectedChannels.value = checked
    ? (selected.includes(value) ? selected : [...selected, value])
    : selected.filter(channel => channel !== value)
}

async function onPublish() {
  if (await editor.publish(postId.value)) publishOpen.value = false
}

// ── Public link and localization ────────────────────────
const publicPath = computed(() => {
  const path = post.value?.public_path
  return path ? String(path) : null
})

const siteLocalizationSettingsPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/settings/localization`)
const postLocalizationFields = computed(() => [
  { key: 'title', label: 'Title', source: post.value?.title },
  { key: 'body', label: 'Body', source: post.value?.body, multiline: true, rows: 6 },
])
function localizedPostPath(locale: string): string {
  const slug = post.value?.slug
  if (typeof slug !== 'string' || !slug) throw new Error('The post slug is unavailable.')
  return `/${locale}/posts/${slug}`
}

useSeoMeta({
  title: () => `${isNew.value ? 'New post' : editor.form.title || 'Post'} | KrabiClaw Dashboard`,
  robots: 'noindex, nofollow',
})
</script>

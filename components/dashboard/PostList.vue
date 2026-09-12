<template>
  <div>
    <DashboardListEditor
      v-model:editing="editing"
      title="Posts"
      description="News, events and offers from this location."
      :items="listItems"
      :pending="pending"
      :error="loadError"
      empty-title="No posts yet"
      empty-icon="i-lucide-file-text"
      add-label="Write a post"
      :removing-id="removingId"
      @add="openNew"
      @open="openExisting"
      @remove="removePost"
    >
      <template #filters>
        <UTabs v-model="activeTab" :items="postTabs" :content="false" aria-label="Post status" />
      </template>

      <template #item="{ item }">
        <button
          type="button"
          class="flex w-full items-center gap-4 text-left"
          :data-testid="`post-${item.id}`"
          @click="openExisting(item)"
        >
          <!--
            The picture leads, and a post without one keeps the same footprint
            so the list does not reflow between rows that have one and rows
            that do not.
          -->
          <span class="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            <img v-if="coverUrl(item.row)" :src="coverUrl(item.row)!" :alt="item.title" class="h-full w-full object-cover">
            <span v-else class="flex h-full w-full items-center justify-center">
              <UIcon name="i-lucide-file-text" class="size-4 text-muted" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-highlighted">{{ item.title }}</span>
            <!--
              What the post is, the way a dish states its price. With four post
              types a row that showed only a date could not tell an offer from
              an event.
            -->
            <span class="mt-1 block truncate text-sm text-muted">{{ item.summary }}</span>
          </span>
        </button>
      </template>
    </DashboardListEditor>
  </div>
</template>

<script setup lang="ts">
import { formatTimestamp, formatCalendarDate } from '~/utils/timezone'
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { normalizePostMediaForForm, useLocationPostEditor } from '~/composables/useLocationPostEditor'
import { getErrorMessage } from '~/utils/errors'

// The posts index. Rendered by `posts.vue`, which owns the frame.
const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const editor = useLocationPostEditor(siteId, currentLocationId)
const route = useRoute()
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const postsPath = computed(() => `${locationPath.value}/posts`)

const TYPE_LABELS: Record<string, string> = {
  standard: 'Update',
  event: 'Event',
  offer: 'Offer',
  alert: 'Alert',
}

const postTabs = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
]
const activeTab = ref<string | number>('all')
const editing = ref(false)
const removingId = ref<string | null>(null)

const isPostsResponse = (value: unknown): value is { posts: ApiRecord[] } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post => isRecord(post) && typeof post.id === 'string' && typeof post.status === 'string')

const requestEvent = useRequestEvent()
const postsKey = computed(() => `dashboard-location-posts:${siteId}:${currentLocationId.value ?? 'missing'}`)
const { data, pending, error, refresh } = await useAsyncData(
  postsKey,
  async () => {
    if (!currentLocationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    // On the server the data is read straight from D1; going back out over HTTP
    // to our own endpoint would cost a round trip during render.
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardLocationPosts } = await import('~/server/utils/dashboard-editor-resources')
      const resource = await loadDashboardLocationPosts(requestEvent, siteId, currentLocationId.value)
      return { posts: resource.posts.posts as ApiRecord[] }
    }
    const response = await dashboardApi<{ posts: ApiRecord[] }>(`/api/editor/sites/${siteId}/posts`, {
      query: { location_id: currentLocationId.value },
      validate: isPostsResponse,
    })
    return { posts: response.posts }
  },
  { lazy: import.meta.client },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Failed to load posts') : null))
const posts = computed(() => data.value?.posts ?? [])

// Filtering happens here rather than by refetching per tab: the list is already
// loaded in full, so a tab press should not cost a round trip.
const visiblePosts = computed(() => {
  if (activeTab.value === 'all') return posts.value
  return posts.value.filter(post => post.status === activeTab.value)
})

const listItems = computed(() => visiblePosts.value.map(row => ({
  id: String(row.id),
  title: postTitle(row),
  summary: postSummary(row),
  row,
})))

// ── Row presentation ────────────────────────────────────
function postTitle(post: ApiRecord): string {
  const title = String(post.title ?? '').trim()
  return title || 'No headline'
}

/** Type, then what makes this one different, then exactly one date. */
function postSummary(post: ApiRecord): string {
  const parts: string[] = [TYPE_LABELS[String(post.post_type)] ?? 'Post']
  const offer = isRecord(post.offer) ? post.offer : null
  if (offer && typeof offer.coupon_code === 'string' && offer.coupon_code) parts.push(`Code ${offer.coupon_code}`)
  parts.push(postWhen(post))
  return parts.filter(Boolean).join(' · ')
}

/** Each post state/type declares the date it displays. */
function postWhen(post: ApiRecord): string {
  if (post.status === 'scheduled') {
    if (typeof post.scheduled_for !== 'string') return 'Publish time missing'
    return `Goes live ${formatDate(post.scheduled_for)}`
  }
  const event = isRecord(post.event) ? post.event : null
  const schedule = event && isRecord(event.schedule) ? event.schedule : null
  if (post.post_type === 'event' || post.post_type === 'offer') {
    if (!schedule || typeof schedule.start_date !== 'string' || typeof schedule.end_date !== 'string') return 'Event schedule missing'
    const start = formatDay(schedule.start_date)
    const end = formatDay(schedule.end_date)
    const window = end && end !== start ? `${start} – ${end}` : start
    return post.post_type === 'offer' ? `Runs ${window}` : window
  }
  return post.updated_at ? `Updated ${formatDate(String(post.updated_at))}` : 'Update time missing'
}

function coverUrl(post: ApiRecord): string | null {
  const cover = normalizePostMediaForForm(post.media).find(entry => entry.slot === 'cover')
  // The thumbnail is a scaled-down duplicate of the same asset, so it is the
  // right source for a row; the full image is only fetched where it shows big.
  return cover?.thumbnail_url ?? null
}

function formatDate(iso: string) {
  if (!iso) return ''
  return formatTimestamp(iso, 'en', 'UTC', { dateStyle: 'medium' })
}

function formatDay(day: string) {
  return day ? formatCalendarDate(day, 'en') : ''
}

// ── Creating ────────────────────────────────────────────
/** A post is created on its own level, where its type, its words and — for an
 *  event or an offer — the window it runs in are each a section of the record
 *  being made, rather than a dialog stacked over the list. */
function openNew() {
  return navigateTo(`${postsPath.value}/new`)
}

/** A post is its own screen, so opening one is navigation, not a sheet. */
function openExisting(item: { id: string }) {
  return navigateTo(`${postsPath.value}/${item.id}`)
}

/** Removal lives in the list's edit state, the way the menu does it. */
async function removePost(item: { id: string }) {
  removingId.value = item.id
  try {
    if (await editor.remove(item.id)) await refresh()
  } finally {
    removingId.value = null
  }
}
</script>

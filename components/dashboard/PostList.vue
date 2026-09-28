<template>
  <div>
    <DashboardListEditor
      v-model:editing="editing"
      title="Posts"
      description="Short posts from this location: news, photos, events and offers, in your own words."
      :items="listItems"
      :pending="pending"
      :error="loadError"
      empty-title="No posts yet"
      empty-icon="i-lucide-file-text"
      add-label="Write a post"
      :removing-id="removingId"
      @add="openNew"
      @remove="removePost"
    >
      <template #filters>
        <UTabs v-model="activeTab" :items="postTabs" :content="false" aria-label="Post status" />
      </template>

      <template #item="{ item }">
        <span class="flex w-full items-center gap-4 text-left" :data-testid="`post-${item.id}`">
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
            <span class="mt-1 flex items-center gap-2 truncate text-sm text-muted">
              <span class="truncate">{{ item.summary }}</span>
              <UIcon v-for="channel in item.channels" :key="channel" :name="channel === 'facebook' ? 'i-logos-facebook' : 'i-skill-icons-instagram'" class="size-3.5 shrink-0" :aria-label="`Published on ${channel}`" />
            </span>
          </span>
        </span>
      </template>
    </DashboardListEditor>
    <div v-if="nextCursor" class="mt-4 flex justify-center">
      <UButton color="neutral" variant="outline" :loading="loadingMore" @click="loadMore">Load more posts</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatTimestamp } from '~/utils/timezone'
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { normalizePostMediaForForm, useLocationPostEditor } from '~/composables/useLocationPostEditor'
import { getErrorMessage } from '~/utils/errors'

// The posts index. Rendered by `posts.vue`, which owns the frame.
const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()
const dashboardLocation = useDashboardLocation()

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const editor = useLocationPostEditor(organizationId, currentLocationId)
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere.
const level = useRouteLevel()

const postTabs = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'draft', label: 'Drafts' },
]
const activeTab = ref<string | number>('all')
const editing = ref(false)
const removingId = ref<string | null>(null)

const isPostsResponse = (value: unknown): value is { posts: ApiRecord[]; page_info: { has_more: boolean; next_cursor: string | null } } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post => isRecord(post) && typeof post.id === 'string' && typeof post.status === 'string')
  && isRecord(value.page_info)

// The tab is a filter the database applies, a page at a time.
const statusFilter = computed(() => (activeTab.value === 'all' ? undefined : String(activeTab.value)))
const postsKey = computed(() => `dashboard-location-posts:${organizationId}:${currentLocationId.value ?? 'missing'}:${statusFilter.value ?? 'all'}`)
const fetchPage = (cursor?: string) => {
  if (!currentLocationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  return dashboardApi<{ posts: ApiRecord[]; page_info: { has_more: boolean; next_cursor: string | null } }>(`/api/editor/organizations/${organizationId}/posts`, {
    query: { location_id: currentLocationId.value, ...(statusFilter.value ? { status: statusFilter.value } : {}), ...(cursor ? { cursor } : {}) },
    validate: isPostsResponse,
  })
}
const { data, pending, error, refresh } = await useAsyncData(postsKey, () => fetchPage(), { lazy: true, watch: [statusFilter] })

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Failed to load posts') : null))
const more = ref<ApiRecord[]>([])
const nextCursor = ref<string | null>(null)
watch(data, value => { more.value = []; nextCursor.value = value?.page_info.has_more ? value.page_info.next_cursor : null }, { immediate: true })
const loadingMore = ref(false)
async function loadMore() {
  if (!nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await fetchPage(nextCursor.value)
    more.value = [...more.value, ...page.posts]
    nextCursor.value = page.page_info.has_more ? page.page_info.next_cursor : null
  } finally {
    loadingMore.value = false
  }
}
const visiblePosts = computed(() => [...(data.value?.posts ?? []), ...more.value])

const listItems = computed(() => visiblePosts.value.map(row => ({
  id: String(row.id),
  title: postTitle(row),
  summary: postSummary(row),
  channels: (Array.isArray(row.publications) ? row.publications as ApiRecord[] : []).filter(item => item.state === 'published').map(item => String(item.channel)),
  to: `${level.path.value}/${String(row.id)}`,
  row,
})))

// ── Row presentation ────────────────────────────────────
function postTitle(post: ApiRecord): string {
  const title = String(post.title ?? '').trim()
  return title || 'No headline'
}

/** Where it stands, then exactly one date. */
function postSummary(post: ApiRecord): string {
  if (post.status === 'published') return typeof post.published_at === 'string' ? `Live since ${formatDate(post.published_at)}` : 'Live'
  return post.updated_at ? `Draft · edited ${formatDate(String(post.updated_at))}` : 'Draft'
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

// ── Creating ────────────────────────────────────────────
/** A post is created on its own level, as a draft, rather than in a dialog stacked over the list. */
function openNew() {
  return navigateTo(`${level.path.value}/new`)
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

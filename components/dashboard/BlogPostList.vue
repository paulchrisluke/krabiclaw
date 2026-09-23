<template>
  <div>
    <DashboardListEditor
      v-model:editing="editing"
      title="Blog"
      description="Long-form articles published on this site."
      :items="listItems"
      :pending="pending"
      :error="loadError"
      empty-title="No posts yet"
      empty-icon="i-lucide-newspaper"
      add-label="Write a post"
      :removing-id="removingId"
      @add="openNew"
      @remove="removePost"
    >
      <template #filters>
        <UTabs v-model="activeTab" :items="statusTabs" :content="false" aria-label="Post status" />
      </template>

      <template #item="{ item }">
        <span class="flex w-full items-center gap-4 text-left" :data-testid="`blog-post-${item.id}`">
          <!--
            The picture leads, and a post without one keeps the same footprint so
            the list does not reflow between rows that have one and rows that do not.
          -->
          <span class="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            <img v-if="coverUrl(item.row)" :src="coverUrl(item.row)!" :alt="coverAlt(item.row)" class="h-full w-full object-cover">
            <span v-else class="flex h-full w-full items-center justify-center">
              <UIcon name="i-lucide-newspaper" class="size-4 text-muted" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-highlighted">{{ item.title }}</span>
            <span class="mt-1 block truncate text-sm text-muted">{{ item.summary }}</span>
          </span>
        </span>
      </template>
    </DashboardListEditor>

    <!--
      Creating asks for the headline and nothing else. A blog post's category,
      excerpt, share card, URL and publishing time are all sections of the post
      once it exists and has an id to hang a document and media on.
    -->
    <DashboardListItemDialog
      v-model:open="newDialogOpen"
      title="New post"
      :removable="false"
      :saving="creating"
      :save-disabled="!newTitle.trim()"
      save-label="Create"
      @save="createPost"
    >
      <UFormField label="Headline" required>
        <UInput
          v-model="newTitle"
          autofocus
          placeholder="What is this post about?"
          class="w-full"
          @keydown.enter.prevent="newTitle.trim() && createPost()"
        />
      </UFormField>

      <UAlert v-if="createFailure" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="createFailure" />

      <p class="text-sm text-muted">
        You'll land in the article editor, where the body is written directly on the page and
        everything else is a section of the post's own settings.
      </p>
    </DashboardListItemDialog>
  </div>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { ARTICLE_COLLECTIONS } from '~/utils/article-collections'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import { tenantBlogRepository } from '~/lib/components/workspace/blog/tenantBlogRepository'
import type { BlogPost } from '~/lib/components/workspace/blog/types'
import { initialBlogEditorBlocks } from '~/utils/blog-editor'
import { getErrorMessage } from '~/utils/errors'
import { mediaStillUrl } from '~/shared/media-placement-contract'

// The blog index. Rendered by `blog.vue`, which owns the frame.
const dashboardApi = useDashboardApi()
const route = useRoute()
const organizationId = await useDashboardOrganizationId()
const orgSlug = route.params.orgSlug as string
const level = useRouteLevel()

const repository = tenantBlogRepository({ organizationId, orgSlug })

// A post's life in order, so the tabs read as the pipeline they are. Drafts
// exist as a status now, and a post created from this list starts as one.
const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Live' },
]
const activeTab = ref<string | number>('all')
const editing = ref(false)
const removingId = ref<string | null>(null)

const isPostsResponse = (value: unknown): value is { posts: BlogPost[] } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post => isRecord(post) && typeof post.id === 'string' && typeof post.title === 'string')

const { data, pending, error, refresh } = await useAsyncData(
  `dashboard-blog-posts:${organizationId}`,
  async () => {
    const response = await dashboardApi<{ posts: BlogPost[] }>(`/api/editor/organizations/${organizationId}/blog/posts`, {
      validate: isPostsResponse,
    })
    return { posts: response.posts }
  },
  { lazy: true },
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
  id: row.id,
  title: row.title.trim() || 'Untitled post',
  summary: postSummary(row),
  to: `${level.path.value}/${row.id}`,
  row,
})))

const STATUS_LABELS: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', published: 'Live' }

/** Where it is in its life, then what it is filed under, then one date. */
function postSummary(post: BlogPost): string {
  // Read from the status rather than treating anything unscheduled as live: a
  // draft was announcing itself as published on the row and in the index.
  const parts: string[] = [post.status ? STATUS_LABELS[post.status] ?? post.status : 'Live']
  // KrabiClaw's own site publishes two collections; the blog is implied everywhere else.
  if (post.collection && post.collection !== 'blog') parts.push(ARTICLE_COLLECTIONS[post.collection].label)
  if (post.category) parts.push(post.category)
  parts.push(postWhen(post))
  return parts.filter(Boolean).join(' · ')
}

function postWhen(post: BlogPost): string {
  if (post.status === 'scheduled' && post.scheduled_for) return `Goes live ${formatDate(post.scheduled_for)}`
  if (post.published_at) return formatDate(post.published_at)
  return post.updated_at ? `Edited ${formatDate(post.updated_at)}` : ''
}

function coverUrl(post: BlogPost): string | null {
  if (!post.cover) return null
  // The thumbnail is a scaled-down duplicate of the same asset, so it is the
  // right source for a row; the full image is only fetched where it shows big.
  return mediaStillUrl(post.cover)
}

/** The cover's description belongs to the asset; the headline is already beside it. */
function coverAlt(post: BlogPost): string {
  return post.cover?.alt_text ?? ''
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Creating ────────────────────────────────────────────
const newDialogOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)
const createFailure = ref<string | null>(null)

function openNew() {
  newTitle.value = ''
  createFailure.value = null
  newDialogOpen.value = true
}

async function createPost() {
  const title = newTitle.value.trim()
  if (!title || creating.value) return
  creating.value = true
  createFailure.value = null
  try {
    const post = await repository.create({ title, content_blocks: initialBlogEditorBlocks() })
    newDialogOpen.value = false
    await navigateTo(`${level.path.value}/${post.id}`)
  } catch (cause) {
    createFailure.value = getErrorMessage(cause, 'Failed to create the post.')
  } finally {
    creating.value = false
  }
}


/** Removal lives in the list's edit state, the way every other list does it. */
async function removePost(item: { id: string }) {
  removingId.value = item.id
  try {
    await repository.delete(item.id)
    await refresh()
  } finally {
    removingId.value = null
  }
}
</script>

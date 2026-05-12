<template>
  <UPage>
    <UPageHeader title="Posts" description="Write, schedule, and publish content to your site and social channels.">
      <template #links>
        <UButton icon="i-heroicons-plus" color="primary" @click="openCompose()">New post</UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <div class="grid gap-6 lg:grid-cols-[1fr_400px]">
        <!-- Left: AI compose + draft list -->
        <div class="space-y-4">
          <!-- AI compose input -->
          <div class="overflow-hidden rounded-lg border border-(--ui-border)">
            <div class="flex items-center gap-2 border-b border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-2.5">
              <UIcon name="i-heroicons-sparkles" class="size-4 text-(--ui-text-muted)" />
              <span class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted)">AI Composer</span>
            </div>
            <div class="p-4 space-y-3">
              <UTextarea
                v-model="aiPrompt"
                :rows="2"
                placeholder="Describe a post... e.g. 'New Year's Eve dinner special, formal, include a call to action'"
                :disabled="aiLoading"
                @keydown.meta.enter="generatePost"
                @keydown.ctrl.enter="generatePost"
              />
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs text-(--ui-text-muted)">
                  <span v-if="credits !== null">{{ credits.toLocaleString() }} credits remaining · </span>Attach a photo for image-aware posts
                </p>
                <div class="flex items-center gap-2">
                  <label class="cursor-pointer">
                    <input ref="aiImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onAiImageSelect" />
                    <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-photo" :class="aiImageFile ? 'text-green-600' : ''" @click="aiImageInput?.click()">
                      {{ aiImageFile ? aiImageFile.name.slice(0, 12) + '…' : 'Photo' }}
                    </UButton>
                  </label>
                  <UButton size="sm" :loading="aiLoading" :disabled="!aiPrompt.trim()" icon="i-heroicons-sparkles" @click="generatePost">
                    Generate
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Draft / published list -->
          <div class="overflow-hidden rounded-lg border border-(--ui-border)">
            <div class="flex items-center justify-between gap-4 border-b border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-2.5">
              <div class="flex items-center gap-3">
                <button
                  v-for="tab in ['all','draft','published']"
                  :key="tab"
                  class="text-xs font-semibold capitalize transition-colors"
                  :class="activeTab === tab ? 'text-(--ui-text-highlighted)' : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
                  @click="activeTab = tab; loadPosts()"
                >{{ tab }}</button>
              </div>
              <UButton v-if="loading" size="xs" color="neutral" variant="ghost" loading />
            </div>

            <!-- Empty state -->
            <div v-if="!loading && posts.length === 0" class="px-4 py-10 text-center">
              <UIcon name="i-heroicons-newspaper" class="mx-auto size-8 text-(--ui-text-muted)" />
              <p class="mt-3 text-sm text-(--ui-text-muted)">No posts yet. Use the AI composer or write one manually.</p>
            </div>

            <!-- Post rows -->
            <div
              v-for="post in posts"
              :key="post.id"
              class="flex cursor-pointer items-start gap-3 border-b border-(--ui-border) px-4 py-3.5 last:border-0 hover:bg-(--ui-bg-elevated)"
              :class="selectedPost?.id === post.id ? 'bg-(--ui-bg-elevated)' : ''"
              @click="selectPost(post)"
            >
              <img v-if="post.image_url" :src="post.image_url" class="size-10 shrink-0 rounded object-cover" />
              <div v-else class="flex size-10 shrink-0 items-center justify-center rounded bg-(--ui-bg-muted)">
                <UIcon name="i-heroicons-document-text" class="size-4 text-(--ui-text-muted)" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-(--ui-text-highlighted)">{{ post.title || post.body.slice(0, 60) }}</p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ formatDate(post.updated_at) }}</p>
              </div>
              <UBadge :color="post.status === 'published' ? 'success' : 'warning'" variant="soft" size="xs" class="shrink-0">{{ post.status }}</UBadge>
            </div>
          </div>
        </div>

        <!-- Right: Editor + preview -->
        <div v-if="selectedPost || composing" class="space-y-4">
          <div class="overflow-hidden rounded-lg border border-(--ui-border)">
            <div class="flex items-center justify-between gap-2 border-b border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-2.5">
              <span class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted)">
                {{ composing ? 'New post' : (selectedPost?.status === 'published' ? 'Published' : 'Draft') }}
              </span>
              <div class="flex gap-1">
                <UButton v-if="selectedPost" size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="handleDelete" />
                <UButton size="xs" color="neutral" variant="ghost" @click="selectedPost = null; composing = false">✕</UButton>
              </div>
            </div>

            <div class="space-y-3 p-4">
              <UFormField label="Title" size="sm">
                <UInput v-model="editForm.title" placeholder="Optional headline…" />
              </UFormField>
              <UFormField label="Body" size="sm">
                <UTextarea v-model="editForm.body" :rows="5" placeholder="What's the post about?" />
              </UFormField>
              <UFormField label="Image URL" size="sm">
                <UInput v-model="editForm.image_url" placeholder="https://…" />
              </UFormField>

              <!-- Channel selector -->
              <div class="border-t border-(--ui-border) pt-3">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted)">Publish to</p>
                <div class="space-y-1.5">
                  <label v-for="ch in channelOptions" :key="ch.value" class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" :value="ch.value" v-model="selectedChannels" :disabled="ch.disabled" class="rounded" />
                    <span class="text-sm" :class="ch.disabled ? 'text-(--ui-text-muted)' : 'text-(--ui-text)'">{{ ch.label }}</span>
                    <UBadge v-if="ch.disabled" size="xs" color="neutral" variant="soft">Not connected</UBadge>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" :loading="saving" @click="handleSaveDraft">Save draft</UButton>
            <UButton class="flex-1" :loading="publishing" :disabled="!editForm.body.trim() || selectedChannels.length === 0" @click="handlePublish">
              Publish{{ selectedChannels.length > 1 ? ` to ${selectedChannels.length} channels` : '' }}
            </UButton>
          </div>

          <!-- Preview -->
          <div v-if="editForm.body" class="overflow-hidden rounded-lg border border-(--ui-border)">
            <p class="border-b border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted)">Site preview</p>
            <div class="p-4">
              <img v-if="editForm.image_url" :src="editForm.image_url" class="mb-3 w-full rounded-lg object-cover max-h-48" />
              <p v-if="editForm.title" class="mb-1 text-base font-bold text-(--ui-text-highlighted)">{{ editForm.title }}</p>
              <p class="text-sm leading-relaxed text-(--ui-text-muted)">{{ editForm.body }}</p>
            </div>
          </div>
        </div>

        <!-- Right: empty state -->
        <div v-else class="hidden lg:flex items-center justify-center rounded-lg border border-dashed border-(--ui-border) text-sm text-(--ui-text-muted)">
          Select a post or generate one with AI
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()

// Posts list
const posts = ref<any[]>([])
const loading = ref(false)
const activeTab = ref('all')

const loadPosts = async () => {
  loading.value = true
  try {
    const status = activeTab.value === 'all' ? undefined : activeTab.value
    const res = await $fetch<any>(`/api/editor/sites/${siteId}/posts${status ? `?status=${status}` : ''}`)
    posts.value = res.posts ?? []
  } catch { posts.value = [] } finally { loading.value = false }
}

onMounted(loadPosts)

// Selection / compose
const selectedPost = ref<any>(null)
const composing = ref(false)
const editForm = reactive({ title: '', body: '', image_url: '' })
const selectedChannels = ref<string[]>(['site'])

const channelOptions = [
  { value: 'site', label: 'This website', disabled: false },
  { value: 'gmb', label: 'Google Business Profile', disabled: true },
  { value: 'instagram', label: 'Instagram', disabled: true },
  { value: 'facebook', label: 'Facebook', disabled: true },
]

const openCompose = () => {
  selectedPost.value = null
  composing.value = true
  editForm.title = ''
  editForm.body = ''
  editForm.image_url = ''
  selectedChannels.value = ['site']
}

const selectPost = (post: any) => {
  composing.value = false
  selectedPost.value = post
  editForm.title = post.title ?? ''
  editForm.body = post.body ?? ''
  editForm.image_url = post.image_url ?? ''
  selectedChannels.value = ['site']
}

// Save / publish / delete
const saving = ref(false)
const publishing = ref(false)

const handleSaveDraft = async () => {
  if (!editForm.body.trim()) return
  saving.value = true
  try {
    if (selectedPost.value) {
      const res = await ($fetch as any)(`/api/editor/sites/${siteId}/posts/${selectedPost.value.id}`, {
        method: 'PATCH', body: { ...editForm },
      })
      selectedPost.value = res.post
    } else {
      const res = await ($fetch as any)(`/api/editor/sites/${siteId}/posts`, {
        method: 'POST', body: { ...editForm },
      })
      selectedPost.value = res.post
      composing.value = false
    }
    toast.add({ description: 'Draft saved', color: 'success' })
    await loadPosts()
  } catch { toast.add({ description: 'Failed to save', color: 'error' }) }
  finally { saving.value = false }
}

const handlePublish = async () => {
  if (!editForm.body.trim()) return
  publishing.value = true
  try {
    // Save any edits first
    let postId = selectedPost.value?.id
    if (!postId || editForm.body !== selectedPost.value?.body || editForm.title !== (selectedPost.value?.title ?? '')) {
      const method = postId ? 'PATCH' : 'POST'
      const url = postId ? `/api/editor/sites/${siteId}/posts/${postId}` : `/api/editor/sites/${siteId}/posts`
      const res = await ($fetch as any)(url, { method, body: { ...editForm } })
      postId = res.post.id
      selectedPost.value = res.post
    }
    const res = await ($fetch as any)(`/api/editor/sites/${siteId}/posts/${postId}/publish`, {
      method: 'POST', body: { channels: selectedChannels.value },
    })
    selectedPost.value = res.post
    composing.value = false
    toast.add({ description: 'Published!', color: 'success' })
    await loadPosts()
  } catch { toast.add({ description: 'Failed to publish', color: 'error' }) }
  finally { publishing.value = false }
}

const handleDelete = async () => {
  if (!selectedPost.value) return
  try {
    await ($fetch as any)(`/api/editor/sites/${siteId}/posts/${selectedPost.value.id}`, { method: 'DELETE' })
    selectedPost.value = null
    toast.add({ description: 'Post deleted', color: 'neutral' })
    await loadPosts()
  } catch { toast.add({ description: 'Failed to delete', color: 'error' }) }
}

// AI composer
const aiPrompt = ref('')
const aiLoading = ref(false)
const aiImageFile = ref<File | null>(null)
const aiImageInput = ref<HTMLInputElement | null>(null)
const credits = ref<number | null>(null)

const onAiImageSelect = (e: Event) => {
  aiImageFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

const generatePost = async () => {
  if (!aiPrompt.value.trim() || aiLoading.value) return
  aiLoading.value = true
  try {
    let image_base64: string | undefined
    let image_mime: string | undefined

    if (aiImageFile.value) {
      const buf = await aiImageFile.value.arrayBuffer()
      image_base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      image_mime = aiImageFile.value.type
    }

    const res = await ($fetch as any)(`/api/ai/${siteId}/posts/generate`, {
      method: 'POST',
      body: { prompt: aiPrompt.value.trim(), image_base64, image_mime },
    })

    credits.value = res.credits?.remaining ?? null
    openCompose()
    editForm.title = res.draft.title ?? ''
    editForm.body = res.draft.body ?? ''
    aiPrompt.value = ''
    aiImageFile.value = null
    toast.add({ description: 'Draft generated — review and publish when ready', color: 'success' })
  } catch (err: any) {
    toast.add({ description: err?.data?.error ?? 'Generation failed. Try again.', color: 'error' })
  } finally { aiLoading.value = false }
}

const formatDate = (iso: string) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: 'Posts | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<template>
  <UDashboardPanel id="admin-blog">
    <template #header>
      <UDashboardNavbar title="Blog">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton size="sm" to="/admin/blog/new">New post</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div v-if="blogError" class="text-sm text-error">{{ blogError }}</div>
        <div v-else-if="blogPosts.length === 0" class="text-sm text-muted py-4">No posts yet.</div>
        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div v-for="post in blogPosts" :key="post.id" class="flex items-center justify-between px-5 py-4">
            <div>
              <p class="font-medium text-default">{{ post.title }}</p>
              <p class="text-xs text-muted">{{ post.published_at ? formatDate(post.published_at) : 'Draft' }}</p>
            </div>
            <div class="flex gap-2">
              <UButton size="xs" variant="outline" :to="`/admin/blog/${post.id}`">Edit</UButton>
              <UButton size="xs" variant="outline" color="error" :loading="deletingPostId === post.id" @click="openDeleteConfirm(post.id)">Delete</UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete post confirm modal -->
  <UModal v-model:open="deleteConfirmOpen" title="Delete post?" :dismissible="deletingPostId === null" :ui="{ content: 'max-w-md' }">
    <template #body>
      <p class="text-sm text-muted">This action cannot be undone.</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="deletingPostId !== null" @click="deleteConfirmOpen = false">Cancel</UButton>
        <UButton color="error" :loading="deletingPostId !== null" @click="confirmDeletePost">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Blog | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface BlogPost { id: string; title: string; published_at: string | null }

const blogPosts = ref<BlogPost[]>([])
const blogError = ref('')
const deleteConfirmOpen = ref(false)
const pendingDeletePostId = ref<string | null>(null)
const deletingPostId = ref<string | null>(null)

async function loadBlogPosts() {
  try {
    const res = await $fetch<{ posts: BlogPost[] }>('/api/admin/blog/posts')
    blogPosts.value = res.posts ?? []
    blogError.value = ''
  } catch {
    blogError.value = 'Failed to load posts.'
  }
}

function openDeleteConfirm(id: string) {
  if (deletingPostId.value !== null) return
  pendingDeletePostId.value = id
  deleteConfirmOpen.value = true
}

async function confirmDeletePost() {
  if (!pendingDeletePostId.value) return
  deletingPostId.value = pendingDeletePostId.value
  try {
    await $fetch(`/api/admin/blog/posts/${pendingDeletePostId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Post deleted', color: 'success' })
    await loadBlogPosts()
  } catch {
    toast.add({ title: 'Failed to delete post', color: 'error' })
  } finally {
    deletingPostId.value = null
    deleteConfirmOpen.value = false
    pendingDeletePostId.value = null
  }
}

onMounted(loadBlogPosts)
</script>

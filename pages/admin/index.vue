<template>
  <div class="platform-theme min-h-screen bg-default">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-default">Platform Admin Dashboard</h1>
          <p class="text-muted mt-2">Manage KrabiClaw platform content and settings</p>
        </div>
        <UColorModeButton variant="ghost" color="neutral" size="sm" />
      </div>

      <div v-if="loading" class="text-center py-12">
        <p class="text-muted">Loading...</p>
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">{{ error }}</p>
      </div>

      <div v-else>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="activeTab = 'content'">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                <UIcon name="i-heroicons-document-text" class="w-6 h-6" />
              </div>
              <div>
                <h3 class="font-semibold text-default">Content</h3>
                <p class="text-sm text-muted">Manage pages</p>
              </div>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="activeTab = 'blog'">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-green-500 text-white rounded-lg flex items-center justify-center">
                <UIcon name="i-heroicons-newspaper" class="w-6 h-6" />
              </div>
              <div>
                <h3 class="font-semibold text-default">Blog</h3>
                <p class="text-sm text-muted">Platform posts</p>
              </div>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="activeTab = 'analytics'">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-purple-500 text-white rounded-lg flex items-center justify-center">
                <UIcon name="i-heroicons-chart-bar" class="w-6 h-6" />
              </div>
              <div>
                <h3 class="font-semibold text-default">Analytics</h3>
                <p class="text-sm text-muted">View metrics</p>
              </div>
            </div>
          </UCard>

          <UCard class="hover:shadow-md transition-shadow cursor-pointer" @click="activeTab = 'chowbot'">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-orange-500 text-white rounded-lg flex items-center justify-center">
                <UIcon name="i-heroicons-sparkles" class="w-6 h-6" />
              </div>
              <div>
                <h3 class="font-semibold text-default">ChowBot</h3>
                <p class="text-sm text-muted">AI assistant</p>
              </div>
            </div>
          </UCard>
        </div>

        <div v-if="activeTab === 'content'" class="bg-elevated rounded-lg shadow-sm border border-default p-6">
          <h2 class="text-xl font-bold text-default mb-4">Platform Content</h2>
          <div class="space-y-4">
            <div v-for="page in platformPages" :key="page" class="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span class="font-medium text-default capitalize">{{ page }}</span>
              <UButton size="sm" variant="outline" @click="editContent(page)">Edit</UButton>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'blog'" class="bg-elevated rounded-lg shadow-sm border border-default p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-default">Platform Blog</h2>
            <UButton size="sm" @click="createPost">New Post</UButton>
          </div>
          <div v-if="blogError" class="text-center py-8 text-red-600">
            {{ blogError }}
          </div>
          <div v-else-if="blogPosts.length === 0" class="text-center py-8 text-muted">
            No blog posts yet. Create your first post!
          </div>
          <div v-else class="space-y-4">
            <div v-for="post in blogPosts" :key="post.id" class="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <h3 class="font-medium text-default">{{ post.title }}</h3>
                <p class="text-sm text-muted">{{ post.published_at ? formatDate(post.published_at) : 'Draft' }}</p>
              </div>
              <div class="flex gap-2">
                <UButton size="sm" variant="outline" @click="editPost(post.id)">Edit</UButton>
                <UButton size="sm" variant="outline" color="red" :loading="deletingPostId === post.id" :disabled="deletingPostId === post.id" @click="openDeleteConfirm(post.id)">Delete</UButton>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'analytics'" class="bg-elevated rounded-lg shadow-sm border border-default p-6">
          <h2 class="text-xl font-bold text-default mb-4">Platform Analytics</h2>
          
          <div v-if="analyticsLoading" class="text-center py-8">
            <p class="text-muted">Loading analytics...</p>
          </div>
          
          <div v-else>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-blue-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-blue-600 mb-2">Total Users</h3>
                <p class="text-3xl font-bold text-blue-900">{{ analytics?.metrics?.users }}</p>
              </div>
              <div class="bg-green-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-green-600 mb-2">Total Sites</h3>
                <p class="text-3xl font-bold text-green-900">{{ analytics?.metrics?.sites }}</p>
              </div>
              <div class="bg-purple-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-purple-600 mb-2">Total Posts</h3>
                <p class="text-3xl font-bold text-purple-900">{{ analytics?.metrics?.posts }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-muted mb-2">Organizations</h3>
                <p class="text-2xl font-bold text-default">{{ analytics?.metrics?.organizations }}</p>
              </div>
              <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-muted mb-2">Menus</h3>
                <p class="text-2xl font-bold text-default">{{ analytics?.metrics?.menus }}</p>
              </div>
              <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="text-sm font-medium text-muted mb-2">Locations</h3>
                <p class="text-2xl font-bold text-default">{{ analytics?.metrics?.locations }}</p>
              </div>
            </div>

            <h3 class="text-lg font-bold text-default mb-4">Recent Sites</h3>
            <div v-if="!analytics?.recentSites?.length" class="text-center py-4 text-muted">
              No sites yet.
            </div>
            <div v-else class="space-y-2">
              <div v-for="site in analytics.recentSites" :key="site.id" class="flex items-center justify-between p-3 bg-muted rounded">
                <div>
                  <p class="font-medium text-default">{{ site.brand_name || site.subdomain }}</p>
                  <p class="text-sm text-muted">{{ site.subdomain }}.krabiclaw.com</p>
                </div>
                <p class="text-sm text-muted">{{ formatDate(site.created_at) }}</p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'chowbot'" class="bg-elevated rounded-lg shadow-sm border border-default p-6">
          <h2 class="text-xl font-bold text-default mb-4">ChowBot AI Assistant</h2>
          <p class="text-muted mb-4">Use ChowBot to generate platform content, blog posts, and more.</p>
          <UTextarea v-model="chowbotPrompt" placeholder="Ask ChowBot to help with platform content..." :rows="4" class="mb-4" />
          <UButton @click="sendToChowbot" :loading="chowbotLoading">Generate</UButton>
          <div v-if="chowbotResponse" class="mt-4 p-4 bg-muted rounded-lg">
            <p class="text-default whitespace-pre-wrap">{{ chowbotResponse }}</p>
          </div>
        </div>
      </div>

      <UModal v-model:open="deleteConfirmOpen" :ui="{ content: 'max-w-md' }">
        <template #content>
          <div class="p-6">
            <h3 class="text-lg font-semibold text-default mb-2">Delete post?</h3>
            <p class="text-sm text-muted mb-6">This action cannot be undone.</p>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="neutral" @click="closeDeleteConfirm">Cancel</UButton>
              <UButton color="red" :loading="deletingPostId !== null" @click="confirmDeletePost">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'default' })

const auth = useAuth()
const activeTab = ref('content')
const loading = ref(true)
const error = ref('')
const { addToast } = useToast()

const platformPages = ['about', 'contact', 'help']
const blogPosts = ref([])
const blogError = ref('')
const deleteConfirmOpen = ref(false)
const pendingDeletePostId = ref(null)
const deletingPostId = ref(null)

const chowbotPrompt = ref('')
const chowbotResponse = ref('')
const chowbotLoading = ref(false)

const analytics = ref({ metrics: { users: 0, organizations: 0, sites: 0, posts: 0, menus: 0, locations: 0 }, recentSites: [] })
const analyticsLoading = ref(false)
const initialized = ref(false)

const isAdmin = computed(() => {
  const user = auth.data.value?.user
  return !!user && (user.role === 'admin' || user.isAdmin === true)
})

watch(() => auth.sessionLoading.value, async (pending) => {
  if (!pending && !isAdmin.value) {
    await navigateTo('/login')
  }
}, { immediate: true })

watch([() => auth.sessionLoading.value, isAdmin], async ([pending, admin]) => {
  if (pending || initialized.value) {
    return
  }

  if (!admin) {
    await navigateTo('/login')
    return
  }

  initialized.value = true

  const [blogResult, analyticsResult] = await Promise.allSettled([loadBlogPosts(), loadAnalytics()])
  const blogFailed = blogResult.status === 'fulfilled' ? blogResult.value === false : true
  const analyticsFailed = analyticsResult.status === 'fulfilled' ? analyticsResult.value === false : true

  if (blogFailed && analyticsFailed) {
    error.value = 'Failed to load dashboard'
  }

  loading.value = false
}, { immediate: true })

async function loadAnalytics() {
  analyticsLoading.value = true
  try {
    const response = await $fetch('/api/admin/analytics')
    analytics.value = response
    return true
  } catch (err) {
    console.error('Failed to load analytics:', err)
    return false
  } finally {
    analyticsLoading.value = false
  }
}

async function loadBlogPosts() {
  try {
    const response = await $fetch('/api/admin/blog/posts')
    blogPosts.value = response.posts || []
    blogError.value = ''
    return true
  } catch (err) {
    console.error('Failed to load blog posts:', err)
    blogError.value = 'Failed to load blog posts. Please try again.'
    return false
  }
}

function formatDate(dateString) {
  if (!dateString) return '—'

  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) return '—'

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function editContent(page) {
  navigateTo(`/admin/content/${page}`)
}

function createPost() {
  navigateTo('/admin/blog/new')
}

function editPost(postId) {
  navigateTo(`/admin/blog/${postId}`)
}

function openDeleteConfirm(postId) {
  pendingDeletePostId.value = postId
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  deleteConfirmOpen.value = false
  pendingDeletePostId.value = null
}

async function confirmDeletePost() {
  if (!pendingDeletePostId.value) return

  deletingPostId.value = pendingDeletePostId.value
  try {
    await $fetch(`/api/admin/blog/posts/${pendingDeletePostId.value}`, { method: 'DELETE' })
    await loadBlogPosts()
    addToast('Post deleted successfully', 'success')
  } catch (err) {
    addToast('Failed to delete post', 'error')
  } finally {
    deletingPostId.value = null
    closeDeleteConfirm()
  }
}

async function sendToChowbot() {
  if (!chowbotPrompt.value.trim()) return
  
  chowbotLoading.value = true
  try {
    const response = await $fetch('/api/admin/ai/generate', {
      method: 'POST',
      body: { prompt: chowbotPrompt.value }
    })
    chowbotResponse.value = response.content
  } catch (err) {
    chowbotResponse.value = 'Failed to generate content. Please try again.'
  } finally {
    chowbotLoading.value = false
  }
}
</script>

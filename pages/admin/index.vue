<template>
  <div class="min-h-screen bg-stone-50 font-sans">
    <!-- Top Navigation -->
    <header class="bg-white border-b border-stone-200 sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-4">
            <h1 class="text-xl font-bold text-gray-900 tracking-tight italic">
              KIKUZUKI <span class="text-stone-400 font-normal">Admin</span>
            </h1>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-500 hidden sm:inline">{{ session?.email }}</span>
            <button @click="handleLogout" class="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div v-if="!session" class="max-w-md mx-auto text-center py-20 bg-white rounded-3xl shadow-sm border border-stone-200 px-8">
        <div class="text-5xl mb-6">🏮</div>
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Management Portal</h2>
        <p class="text-gray-500 mb-10">Please sign in with your authorized Google account to manage restaurant data.</p>
        <a href="/api/auth/google" class="inline-flex items-center justify-center w-full px-6 py-4 text-lg font-bold text-white bg-black rounded-2xl hover:bg-stone-800 transition-all transform hover:scale-[1.02] shadow-xl">
          Sign in with Google
        </a>
      </div>

      <div v-else class="space-y-8">
        <!-- Quick Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Total Reviews</h3>
            <p class="text-4xl font-bold text-gray-900">{{ publicData?.business?.reviewSummary?.totalReviewCount || 0 }}</p>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Average Rating</h3>
            <div class="flex items-baseline gap-2">
              <p class="text-4xl font-bold text-gray-900">{{ Number(publicData?.business?.reviewSummary?.averageRating || 0).toFixed(1) }}</p>
              <span class="text-yellow-400 text-2xl">★</span>
            </div>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
            <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Live Posts</h3>
            <p class="text-4xl font-bold text-gray-900">{{ publicData?.posts?.length || 0 }}</p>
          </div>
        </div>

        <!-- Google Connection Discovery -->
        <div class="bg-stone-900 rounded-3xl p-8 md:p-10 text-white shadow-2xl relative overflow-hidden">
          <div class="relative z-10">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
              <div>
                <h2 class="text-3xl font-bold italic mb-2 tracking-tight">API Connection Status</h2>
                <p class="text-white/60">Manage your Google Business Profile integration keys.</p>
              </div>
              <button 
                @click="triggerSync" 
                :disabled="isSyncing"
                class="px-8 py-4 bg-white text-black rounded-2xl font-bold hover:bg-stone-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              >
                <span v-if="isSyncing" class="animate-spin text-xl">↻</span>
                {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-4">
                <label class="text-xs font-bold uppercase tracking-widest text-white/40">Account ID</label>
                <div class="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between group">
                  <code class="text-amber-400 font-mono text-sm break-all">
                    {{ currentAccountId || 'Discovering...' }}
                  </code>
                  <button @click="copyToClipboard(currentAccountId)" class="opacity-0 group-hover:opacity-100 text-xs bg-white/10 px-2 py-1 rounded transition-opacity">Copy</button>
                </div>
              </div>
              <div class="space-y-4">
                <label class="text-xs font-bold uppercase tracking-widest text-white/40">Location ID</label>
                <div class="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between group">
                  <code class="text-amber-400 font-mono text-sm break-all">
                    {{ currentLocationId || 'Discovering...' }}
                  </code>
                  <button @click="copyToClipboard(currentLocationId)" class="opacity-0 group-hover:opacity-100 text-xs bg-white/10 px-2 py-1 rounded transition-opacity">Copy</button>
                </div>
              </div>
            </div>

            <div v-if="!currentAccountId" class="mt-10 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-200 text-sm leading-relaxed">
              <strong>Tip:</strong> If IDs are missing, make sure you have added <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your .env file and signed in with the business owner account.
            </div>
          </div>
        </div>

        <!-- Navigation Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
          <NuxtLink to="/admin/reviews" class="bg-white p-10 rounded-3xl shadow-sm border border-stone-200 hover:border-black transition-all group">
            <div class="text-4xl mb-4 group-hover:scale-110 transition-transform inline-block">💬</div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Manage Reviews</h3>
            <p class="text-gray-500 leading-relaxed">Approve, reject, or reply to customer feedback from Google and this website.</p>
          </NuxtLink>
          <NuxtLink to="/admin/posts" class="bg-white p-10 rounded-3xl shadow-sm border border-stone-200 hover:border-black transition-all group">
            <div class="text-4xl mb-4 group-hover:scale-110 transition-transform inline-block">📢</div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">Business Updates</h3>
            <p class="text-gray-500 leading-relaxed">View and audit the news, events, and offers currently live on the site.</p>
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
const { data: session } = await useFetch('/api/auth/session')
const { data: publicData } = await useFetch('/api/google-business/public')

const isSyncing = ref(false)
const currentAccountId = ref('')
const currentLocationId = ref('')

// Try to discover IDs from the API
onMounted(async () => {
  if (session.value) {
    try {
      const data = await $fetch('/api/admin/google-business/ids')
      if (data.discovery && data.discovery.length > 0) {
        // Just take the first account/location for simplicity, 
        // or the one that matches our current name if we had it.
        const firstAccount = data.discovery[0]
        currentAccountId.value = firstAccount.accountId
        if (firstAccount.locations.length > 0) {
          currentLocationId.value = firstAccount.locations[0].locationId
        }
      }
    } catch (e) {
      console.warn('Auto-discovery failed. This is normal if you haven\'t completed the OAuth flow yet.')
    }
  }
})

const handleLogout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/'
}

const triggerSync = async () => {
  isSyncing.value = true
  try {
    await $fetch('/api/admin/google-business/sync', { method: 'POST' })
    alert('Sync completed successfully!')
    // Refresh public data
    const { data: newData } = await useFetch('/api/google-business/public', { key: Date.now().toString() })
    publicData.value = newData.value
  } catch (e) {
    alert('Sync failed. Please check your Google Business API credentials.')
  } finally {
    isSyncing.value = false
  }
}

const copyToClipboard = (text) => {
  if (!text) return
  navigator.clipboard.writeText(text)
  alert('Copied to clipboard!')
}
</script>

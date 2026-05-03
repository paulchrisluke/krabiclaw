<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Connections</h1>
      <p class="text-stone-400 mt-2">Manage your Google service integrations.</p>
    </div>

    <!-- Google Account -->
    <div class="bg-white rounded-3xl border border-stone-200 p-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-lg">G</div>
          <div>
            <h2 class="font-bold text-gray-900">Google Account</h2>
            <p class="text-sm text-stone-400">{{ session?.email }}</p>
          </div>
        </div>
        <span class="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full">Connected</span>
      </div>
    </div>

    <!-- Google Business Profile -->
    <div class="bg-white rounded-3xl border border-stone-200 p-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-gray-900 mb-1">Google Business Profile</h2>
          <p v-if="gbpConnected" class="text-sm text-green-600">
            ✓ {{ publicData?.business?.title || 'Connected' }}
          </p>
          <p v-else class="text-sm text-stone-400">Sync your restaurant info, reviews, photos and posts</p>
        </div>
        <div v-if="gbpConnected" class="flex items-center gap-3">
          <span class="text-xs text-stone-400">{{ publicData?.syncedAt ? `Updated ${formatRelative(publicData.syncedAt)}` : 'Never synced' }}</span>
          <button @click="confirmUnlink" class="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors font-medium">
            Unlink
          </button>
        </div>
        <a v-else href="/api/auth/google" class="text-sm font-semibold bg-black text-white px-5 py-2.5 rounded-xl hover:bg-stone-800 transition-colors">
          Link →
        </a>
      </div>
      <div v-if="unlinkPending" class="mt-4 p-4 bg-red-50 rounded-2xl border border-red-100">
        <p class="text-sm text-red-700 mb-3 font-medium">Unlink your Google Business Profile? Your site will stop receiving updates.</p>
        <div class="flex gap-3">
          <button @click="doUnlink" class="text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
            Yes, unlink
          </button>
          <button @click="unlinkPending = false" class="text-sm font-medium text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-100 transition-colors">
            Cancel
          </button>
        </div>
      </div>
      <!-- Developer details -->
      <details v-if="gbpConnected" class="mt-6 border-t border-stone-100 pt-4">
        <summary class="text-xs font-medium text-stone-400 cursor-pointer">Developer details</summary>
        <dl class="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><dt class="text-stone-400">Reviews</dt><dd class="font-medium">{{ publicData?.reviews?.length ?? 0 }}</dd></div>
          <div><dt class="text-stone-400">Media</dt><dd class="font-medium">{{ publicData?.media?.length ?? 0 }}</dd></div>
          <div><dt class="text-stone-400">Posts</dt><dd class="font-medium">{{ publicData?.posts?.length ?? 0 }}</dd></div>
          <div>
            <dt class="text-stone-400">Sync errors</dt>
            <dd :class="syncErrors.length ? 'text-red-600 font-medium' : 'font-medium'">{{ syncErrors.length }}</dd>
          </div>
        </dl>
        <div v-if="syncErrors.length" class="mt-3 space-y-1">
          <div v-for="err in syncErrors" :key="err.source" class="text-xs font-mono text-red-600 break-all">
            [{{ err.source }}] {{ err.message }}
          </div>
        </div>
        <button @click="triggerSync" :disabled="syncing" class="mt-3 text-xs bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-50 transition-colors">
          {{ syncing ? 'Syncing...' : 'Force sync' }}
        </button>
        <span v-if="syncMessage" :class="['ml-2 text-xs', syncError ? 'text-red-600' : 'text-green-600']">{{ syncMessage }}</span>
      </details>
    </div>

    <!-- Google Analytics -->
    <div class="bg-white rounded-3xl border border-stone-200 p-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-gray-900 mb-1">Google Analytics</h2>
          <p v-if="config?.ga4_property_id" class="text-sm text-green-600">✓ Property {{ config.ga4_property_id }}</p>
          <p v-else class="text-sm text-stone-400">View sessions, traffic sources and top pages in Insights</p>
        </div>
        <div v-if="config?.ga4_property_id" class="flex items-center gap-3">
          <button @click="unlinkService('ga4_property_id')" class="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors font-medium">
            Unlink
          </button>
        </div>
        <button v-else @click="discoverAndLink('analytics')" :disabled="discovering" class="text-sm font-semibold bg-black text-white px-5 py-2.5 rounded-xl hover:bg-stone-800 disabled:opacity-50 transition-colors">
          {{ discovering === 'analytics' ? 'Loading...' : 'Link →' }}
        </button>
      </div>
      <!-- Property picker -->
      <div v-if="ga4Properties.length" class="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200">
        <p class="text-sm font-medium text-gray-900 mb-3">Select your GA4 property:</p>
        <div class="space-y-2">
          <button
            v-for="prop in ga4Properties"
            :key="prop.id"
            @click="selectConfig('ga4_property_id', prop.id)"
            class="w-full text-left text-sm px-4 py-3 bg-white border border-stone-200 rounded-xl hover:border-black transition-colors"
          >
            <span class="font-medium">{{ prop.name }}</span>
            <span class="text-stone-400 ml-2 text-xs">{{ prop.id }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Search Console -->
    <div class="bg-white rounded-3xl border border-stone-200 p-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-gray-900 mb-1">Google Search Console</h2>
          <p v-if="config?.search_console_site_url" class="text-sm text-green-600">✓ {{ config.search_console_site_url }}</p>
          <p v-else class="text-sm text-stone-400">View search queries, clicks and rankings in Insights</p>
        </div>
        <div v-if="config?.search_console_site_url" class="flex items-center gap-3">
          <button @click="unlinkService('search_console_site_url')" class="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors font-medium">
            Unlink
          </button>
        </div>
        <button v-else @click="discoverAndLink('gsc')" :disabled="discovering" class="text-sm font-semibold bg-black text-white px-5 py-2.5 rounded-xl hover:bg-stone-800 disabled:opacity-50 transition-colors">
          {{ discovering === 'gsc' ? 'Loading...' : 'Link →' }}
        </button>
      </div>
      <!-- Site picker -->
      <div v-if="gscSites.length" class="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200">
        <p class="text-sm font-medium text-gray-900 mb-3">Select your verified site:</p>
        <div class="space-y-2">
          <button
            v-for="site in gscSites"
            :key="site.url"
            @click="selectConfig('search_console_site_url', site.url)"
            class="w-full text-left text-sm px-4 py-3 bg-white border border-stone-200 rounded-xl hover:border-black transition-colors"
          >
            <span class="font-medium">{{ site.url }}</span>
            <span class="text-stone-400 ml-2 text-xs">{{ site.permission }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'admin' })

const { data: session } = await useFetch('/api/auth/session', { key: 'admin-session' })
const { data: publicData, refresh: refreshPublic } = await useFetch('/api/google-business/public', { key: 'google-business-public' })
const { data: configData, refresh: refreshConfig } = await useFetch('/api/admin/config', { key: 'admin-config' })

const config = computed(() => configData.value?.config ?? {})
const gbpConnected = computed(() => Boolean(publicData.value?.syncedAt))
const syncErrors = computed(() => publicData.value?.errors?.filter(e => e.source !== 'db') ?? [])

const syncing = ref(false)
const syncMessage = ref('')
const syncError = ref(false)
const unlinkPending = ref(false)
const discovering = ref('')
const ga4Properties = ref([])
const gscSites = ref([])

const triggerSync = async () => {
  syncing.value = true
  syncMessage.value = ''
  syncError.value = false
  try {
    const result = await $fetch('/api/admin/google-business/sync', { method: 'POST' })
    const errorCount = result.sync?.errors?.filter(e => e.source !== 'db').length ?? 0
    syncMessage.value = errorCount > 0 ? `${errorCount} warning${errorCount > 1 ? 's' : ''}` : 'Done'
    await refreshPublic()
  } catch (e) {
    syncMessage.value = 'Failed'
    syncError.value = true
  } finally {
    syncing.value = false
  }
}

const confirmUnlink = () => { unlinkPending.value = true }

const doUnlink = async () => {
  await $fetch('/api/admin/google-business/unlink', { method: 'POST' })
  unlinkPending.value = false
  await refreshPublic()
}

const discoverAndLink = async (service) => {
  discovering.value = service
  ga4Properties.value = []
  gscSites.value = []
  try {
    const data = await $fetch('/api/admin/insights/discover')
    if (service === 'analytics') ga4Properties.value = data.ga4Properties ?? []
    if (service === 'gsc') gscSites.value = data.gscSites ?? []
  } catch (e) {
    console.error('Discovery failed', e)
  } finally {
    discovering.value = ''
  }
}

const selectConfig = async (key, value) => {
  await $fetch('/api/admin/config', { method: 'POST', body: { key, value } })
  ga4Properties.value = []
  gscSites.value = []
  await refreshConfig()
}

const unlinkService = async (key) => {
  await $fetch('/api/admin/config', { method: 'POST', body: { key, value: null } })
  await refreshConfig()
}

const formatRelative = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago` 
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago` 
  return `${Math.floor(diff / 86400)}d ago` 
}

useSeoMeta({ title: 'Connections | KIKUZUKI Admin', robots: 'noindex, nofollow' })
</script>

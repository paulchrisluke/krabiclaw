<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-(--ui-text-highlighted)">Connections</h1>
      <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mt-2">Manage your Google service integrations.</p>
    </div>

    <!-- Google Account -->
    <UCard>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-full bg-(--ui-bg-elevated)  flex items-center justify-center">
            <Icon name="i-heroicons-globe-alt" class="text-lg" />
          </div>
          <div>
            <h2 class="font-bold text-(--ui-text-highlighted)">Google Account</h2>
            <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">{{ session?.email }}</p>
          </div>
        </div>
        <UBadge color="success" variant="soft">Connected</UBadge>
      </div>
    </UCard>

    <!-- Google Business Profile -->
    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-(--ui-text-highlighted) mb-1">Google Business Profile</h2>
          <p v-if="gbpConnected" class="text-sm text-green-600">
            ✓ {{ publicData?.business?.title || 'Connected' }}
          </p>
          <p v-else class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Sync your restaurant info, reviews, photos and posts</p>
        </div>
        <div v-if="gbpConnected" class="flex items-center gap-3">
          <span class="text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">{{ publicData?.syncedAt ? `Updated ${formatRelative(publicData.syncedAt)}` : 'Never synced' }}</span>
          <UButton @click="confirmUnlink" size="sm" variant="ghost" color="error">
            Unlink
          </UButton>
        </div>
        <UButton
          v-else
          @click="handleGoogleLink"
          size="sm"
          color="primary"
        >
          Link →
        </UButton>
      </div>
      <UAlert v-if="unlinkPending" color="error" variant="soft" class="mt-4">
        <template #title>Unlink Google Business Profile?</template>
        <template #description>Your site will stop receiving updates.</template>
        <template #actions>
          <UButton @click="doUnlink" size="sm" color="error">Yes, unlink</UButton>
          <UButton @click="unlinkPending = false" size="sm" variant="ghost">Cancel</UButton>
        </template>
      </UAlert>
      <!-- Developer details -->
      <details v-if="gbpConnected" class="mt-6 border-t border-(--ui-border) dark:border-gray-700 pt-4">
        <summary class="text-xs font-medium text-(--ui-text-muted) dark:text-(--ui-text-dimmed) cursor-pointer">Developer details</summary>
        <dl class="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><dt class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Reviews</dt><dd class="font-medium">{{ publicData?.reviews?.length ?? 0 }}</dd></div>
          <div><dt class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Media</dt><dd class="font-medium">{{ publicData?.media?.length ?? 0 }}</dd></div>
          <div><dt class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Posts</dt><dd class="font-medium">{{ publicData?.posts?.length ?? 0 }}</dd></div>
          <div>
            <dt class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Sync errors</dt>
            <dd :class="syncErrors.length ? 'text-red-600 font-medium' : 'font-medium'">{{ syncErrors.length }}</dd>
          </div>
        </dl>
        <div v-if="syncErrors.length" class="mt-3 space-y-1">
          <div v-for="err in syncErrors" :key="err.source" class="text-xs font-mono text-red-600 break-all">
            [{{ err.source }}] {{ err.message }}
          </div>
        </div>
        <UButton @click="triggerSync" :disabled="syncing" size="xs" variant="outline">
          {{ syncing ? 'Syncing...' : 'Force sync' }}
        </UButton>
        <UBadge v-if="syncMessage" :color="syncError ? 'error' : 'success'" variant="soft" class="ml-2">
          {{ syncMessage }}
        </UBadge>
      </details>
    </UCard>

    <!-- Google Analytics -->
    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-(--ui-text-highlighted) mb-1">Google Analytics</h2>
          <p v-if="config?.ga4_property_id" class="text-sm text-green-600">
            ✓ Property {{ config.ga4_property_id }}
          </p>
          <p v-else class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">View sessions, traffic sources and top pages in Insights</p>
        </div>
        <div v-if="config?.ga4_property_id" class="flex items-center gap-3">
          <UButton @click="unlinkService('ga4_property_id')" size="sm" variant="ghost" color="error">
            Unlink
          </UButton>
        </div>
        <UButton
          v-else
          @click="discoverAndLink('analytics')"
          :disabled="discovering"
          size="sm"
          color="neutral"
        >
          {{ discovering === 'analytics' ? 'Loading...' : 'Link →' }}
        </UButton>
      </div>
      <!-- Property picker -->
      <UCard v-if="ga4Properties.length" class="mt-4">
        <p class="text-sm font-medium text-(--ui-text-highlighted) mb-3">Select your GA4 property:</p>
        <div class="space-y-2">
          <UButton
            v-for="prop in ga4Properties"
            :key="prop.id"
            @click="selectConfig('ga4_property_id', prop.id)"
            variant="outline"
            block
            class="justify-start"
          >
            <span class="font-medium">{{ prop.name }}</span>
            <span class="text-(--ui-text-dimmed) text-xs ml-2">{{ prop.id }}</span>
          </UButton>
        </div>
      </UCard>
    </UCard>

    <!-- Search Console -->
    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="font-bold text-(--ui-text-highlighted) mb-1">Google Search Console</h2>
          <p v-if="config?.search_console_site_url" class="text-sm text-green-600">
            ✓ {{ config.search_console_site_url }}
          </p>
          <p v-else class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">View search queries, clicks and rankings in Insights</p>
        </div>
        <div v-if="config?.search_console_site_url" class="flex items-center gap-3">
          <UButton @click="unlinkService('search_console_site_url')" size="sm" variant="ghost" color="error">
            Unlink
          </UButton>
        </div>
        <UButton
          v-else
          @click="discoverAndLink('gsc')"
          :disabled="discovering === 'gsc'"
          size="sm"
          color="primary"
        >
          {{ discovering === 'gsc' ? 'Loading...' : 'Link →' }}
        </UButton>
      </div>
      <!-- Site picker -->
      <UCard v-if="gscSites.length" class="mt-4">
        <p class="text-sm font-medium text-(--ui-text-highlighted) mb-3">Select your verified site:</p>
        <div class="space-y-2">
          <UButton
            v-for="site in gscSites"
            :key="site.url"
            @click="selectConfig('search_console_site_url', site.url)"
            variant="outline"
            block
            class="justify-start"
          >
            <span class="font-medium">{{ site.url }}</span>
            <span class="text-(--ui-text-dimmed) ml-2 text-xs">{{ site.permission }}</span>
          </UButton>
        </div>
      </UCard>
    </UCard>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { authClient } from '~/lib/auth-client'

definePageMeta({
  layout: 'dashboard'
})

const { user } = useAuth()
const organizationsState = authClient.useListOrganizations()
const organizations = computed(() => unref(organizationsState)?.data ?? [])
const sites = ref([])

// Load sites to get siteId for scoped endpoint
watch(organizations, async (newOrgs) => {
  if (newOrgs.length > 0) {
    try {
      const userSites = await $fetch('/api/sites')
      sites.value = userSites.sites
    } catch (error) {
      console.error('Failed to load sites:', error)
    }
  } else {
    sites.value = []
  }
}, { immediate: true })

const firstSiteId = computed(() => sites.value?.[0]?.id)

const { data: publicData, refresh: refreshPublic } = await useFetch(
  computed(() => firstSiteId.value ? `/api/public/sites/${firstSiteId.value}/google-business` : null),
  { key: computed(() => firstSiteId.value ? `connection-google-business-${firstSiteId.value}` : undefined) }
)
const { data: configData, refresh: refreshConfig } = await useFetch('/api/dashboard/config', { key: 'dashboard-config' })

const config = computed(() => configData.value?.config ?? {})
const gbpConnected = computed(() => Boolean(publicData.value?.syncedAt))
const syncErrors = computed(() => publicData.value?.errors?.filter(e => e.source !== 'db') ?? [])

async function handleGoogleLink() {
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: '/dashboard/connection'
  })
}

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
    const result = await $fetch('/api/dashboard/google-business/sync', { method: 'POST' })
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
  await $fetch('/api/dashboard/google-business/unlink', { method: 'POST' })
  unlinkPending.value = false
  await refreshPublic()
}

const discoverAndLink = async (service) => {
  discovering.value = service
  ga4Properties.value = []
  gscSites.value = []
  try {
    const data = await $fetch('/api/dashboard/insights/discover')
    if (service === 'analytics') ga4Properties.value = data.ga4Properties ?? []
    if (service === 'gsc') gscSites.value = data.gscSites ?? []
  } catch (e) {
    console.error('Discovery failed', e)
  } finally {
    discovering.value = ''
  }
}

const selectConfig = async (key, value) => {
  await $fetch('/api/dashboard/config', { method: 'POST', body: { key, value } })
  ga4Properties.value = []
  gscSites.value = []
  await refreshConfig()
}

const unlinkService = async (key) => {
  await $fetch('/api/dashboard/config', { method: 'POST', body: { key, value: null } })
  await refreshConfig()
}

const formatRelative = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago` 
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago` 
  return `${Math.floor(diff / 86400)}d ago` 
}

useSeoMeta({ title: 'Connections | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

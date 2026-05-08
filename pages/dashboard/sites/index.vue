<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-(--ui-text-highlighted) ">Sites</h1>
      <UButton to="/dashboard/onboarding" color="primary">
        <Icon name="i-heroicons-plus" class="w-4 h-4 mr-2" />
        Add New Site
      </UButton>
    </div>

    <!-- Loading state -->
    <div v-if="pending" class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6">
      <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Loading your sites...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6 text-center">
      <div class="max-w-md mx-auto">
        <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-500" />
        </div>
        <h3 class="text-lg font-medium text-(--ui-text-highlighted)  mb-2">Failed to load sites</h3>
        <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-4">{{ error.data?.message || error.message || 'An unexpected error occurred.' }}</p>
        <UButton @click="refresh" color="neutral" variant="outline">
          Retry
        </UButton>
      </div>
    </div>

    <!-- Sites list -->
    <div v-else-if="sites.length > 0" class="grid gap-4">
      <div v-for="site in sites" :key="site.id" 
           class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-medium text-(--ui-text-highlighted) ">{{ site.name }}</h3>
            <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mt-1">
              <span v-if="site.subdomain">{{ site.subdomain }}{{ platformHostname ? `.${platformHostname}` : '' }}</span>
              <span v-else-if="site.custom_domain">{{ site.custom_domain }}</span>
              <span v-else>Unconfigured</span>
            </p>
            <div class="flex gap-2 mt-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="getStatusClass(site.status)">
                {{ site.status }}
              </span>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {{ site.plan }}
              </span>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton :to="`/dashboard/sites/${site.id}`" size="sm" variant="outline">
              Manage
            </UButton>
            <UButton v-if="getSiteUrl(site)" :href="getSiteUrl(site)" target="_blank" size="sm" variant="soft">
              View Site
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6 text-center">
      <div class="max-w-md mx-auto">
        <div class="w-16 h-16 bg-(--ui-bg-elevated) dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="i-heroicons-globe-alt" class="w-8 h-8 text-(--ui-text-dimmed)" />
        </div>
        <h3 class="text-lg font-medium text-(--ui-text-highlighted)  mb-2">No sites yet</h3>
        <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-4">Create your first restaurant website to get started.</p>
        <UButton to="/dashboard/onboarding" color="primary" block>
          <Icon name="i-heroicons-plus" class="w-4 h-4 mr-2" />
          Create Your First Site
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})

const config = useRuntimeConfig()
const { data: response, pending, error, refresh } = await useFetch('/api/sites')
const sites = computed(() => response.value?.sites || [])

// Extract hostname for URLs
const platformHostname = computed(() => {
  const domain = config.public?.freeSiteDomain
  if (!domain) return ''
  try {
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`
    return new URL(urlStr).hostname
  } catch (e) {
    return domain.replace(/^https?:\/\//, '').split('/')[0]
  }
})

// Get site URL based on subdomain or custom domain
const getSiteUrl = (site) => {
  const domain = config.public?.freeSiteDomain || ''
  if (site.subdomain && platformHostname.value) {
    // Default to https unless explicitly http
    const protocol = domain.startsWith('http://') ? 'http://' : 'https://'
    return `${protocol}${site.subdomain}.${platformHostname.value}`
  }
  if (site.custom_domain) {
    return `https://${site.custom_domain}`
  }
  return null
}

// Get status styling
const getStatusClass = (status) => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'inactive':
      return 'bg-(--ui-bg-elevated) text-(--ui-text-highlighted) dark:bg-gray-700 dark:text-gray-200'
    case 'suspended':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  }
}
</script>

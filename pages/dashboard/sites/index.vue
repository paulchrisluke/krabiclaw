<template>
  <UPage>
    <UPageHeader
      title="Websites"
      description="All restaurant websites in this organization."
      :links="[{ label: 'Create Website', icon: 'i-heroicons-plus', to: '/dashboard/onboarding' }]"
    />

    <UPageBody>
      <div v-if="pending" class="grid gap-4">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        title="Failed to load websites"
        :description="error.data?.message || error.message"
      />

      <UCard v-else-if="sites.length === 0">
        <div class="mx-auto max-w-md py-10 text-center">
          <UIcon name="i-heroicons-globe-alt" class="mx-auto size-10 text-muted" />
          <h2 class="mt-4 text-xl font-semibold text-highlighted">No websites yet</h2>
          <p class="mt-2 text-sm text-muted">Create a website first, then add physical locations inside it.</p>
          <UButton to="/dashboard/onboarding" icon="i-heroicons-plus" color="primary" class="mt-6">
            Create Website
          </UButton>
        </div>
      </UCard>

      <div v-else class="grid gap-4">
        <UCard
          v-for="site in sites"
          :key="site.id"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-lg font-semibold text-highlighted">{{ site.brand_name }}</h2>
                <UBadge :color="site.status === 'active' ? 'success' : 'warning'" variant="soft">{{ site.status }}</UBadge>
                <UBadge color="neutral" variant="soft">{{ site.plan }}</UBadge>
              </div>
              <p class="mt-1 truncate text-sm text-muted">{{ siteUrlLabel(site) }}</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton :to="`/dashboard/sites/${site.id}`" icon="i-heroicons-arrow-right" trailing color="primary">
                Manage
              </UButton>
              <UButton
                v-if="siteUrl(site)"
                :to="siteUrl(site)!"
                target="_blank"
                icon="i-heroicons-arrow-top-right-on-square"
                color="neutral"
                variant="soft"
                external
              >
                View Site
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface DashboardSite {
  id: string
  brand_name: string
  subdomain: string | null
  custom_domain: string | null
  status: string
  plan: string
}

const config = useRuntimeConfig()
const { data: response, pending, error } = await useFetch<{ sites: DashboardSite[] }>('/api/sites')
const sites = computed(() => response.value?.sites || [])
const platformUrl = computed(() => {
  try {
    const domain = config.public.freeSiteDomain
    if (!domain) return null
    return new URL(domain)
  } catch {
    return null
  }
})

const siteUrlLabel = (site: DashboardSite) => {
  if (site.custom_domain) return site.custom_domain
  if (site.subdomain && platformUrl.value) return `${site.subdomain}.${platformUrl.value.hostname}`
  return null
}
const siteUrl = (site: DashboardSite): string | null => {
  if (site.custom_domain) return `https://${site.custom_domain}`
  if (site.subdomain && platformUrl.value) {
    return `${platformUrl.value.protocol}//${site.subdomain}.${platformUrl.value.hostname}${platformUrl.value.port ? `:${platformUrl.value.port}` : ''}`
  }
  return null
}

useSeoMeta({ title: 'Websites | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<template>
  <UPage>
    <UPageHeader
      title="Dashboard"
      description="Your organization workspace for restaurant websites."
      :links="[{ label: 'Create Website', icon: 'i-heroicons-plus', to: '/dashboard/onboarding' }]"
    />

    <UPageBody>
      <div v-if="loading" class="grid gap-4">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <UCard v-else-if="!hasOrganization">
        <div class="mx-auto max-w-md py-10 text-center">
          <UIcon name="i-heroicons-building-storefront" class="mx-auto size-10 text-muted" />
          <h2 class="mt-4 text-xl font-semibold text-highlighted">Create your restaurant workspace</h2>
          <p class="mt-2 text-sm text-muted">Start with one website, then add locations for local menus, hours, and Google Business data.</p>
          <UButton to="/dashboard/onboarding" icon="i-heroicons-plus" color="primary" size="lg" class="mt-6">
            Get Started
          </UButton>
        </div>
      </UCard>

      <div v-else class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <p class="text-sm text-muted">Websites</p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">{{ sites.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Plan</p>
            <p class="mt-2 text-3xl font-semibold capitalize text-highlighted">{{ billing?.plan || 'Free' }}</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">Websites</h2>
                <p class="mt-1 text-sm text-muted">Choose a website to manage brand content, locations, menus, and launch settings.</p>
              </div>
              <UButton to="/dashboard/sites" color="neutral" variant="soft" icon="i-heroicons-squares-2x2">
                View All
              </UButton>
            </div>
          </template>

          <div v-if="sites.length === 0" class="py-8 text-center">
            <p class="font-medium text-highlighted">No websites yet</p>
            <p class="mt-1 text-sm text-muted">Create your first restaurant website to begin.</p>
            <UButton to="/dashboard/onboarding" icon="i-heroicons-plus" color="primary" class="mt-4">
              Create Website
            </UButton>
          </div>

          <div v-else class="divide-y divide-default">
            <NuxtLink
              v-for="site in sites.slice(0, 5)"
              :key="site.id"
              :to="`/dashboard/sites/${site.id}`"
              class="group flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate font-medium text-highlighted">{{ site.brand_name }}</p>
                  <UBadge :color="site.status === 'active' ? 'success' : 'warning'" variant="soft" size="xs">
                    {{ site.status }}
                  </UBadge>
                </div>
                <p class="mt-1 truncate text-sm text-muted">{{ siteUrlLabel(site) }}</p>
              </div>
              <UIcon name="i-heroicons-arrow-right" class="size-5 shrink-0 text-muted transition group-hover:text-primary" />
            </NuxtLink>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Settings</h2>
          </template>
          <p class="text-sm text-muted">Manage profile and organization preferences.</p>
          <UButton to="/dashboard/settings" color="neutral" variant="soft" icon="i-heroicons-cog-6-tooth" block class="mt-4">
            Open Settings
          </UButton>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'dashboard' })

interface DashboardSite {
  id: string
  brand_name: string
  subdomain: string | null
  custom_domain: string | null
  status: string
}

const config = useRuntimeConfig()
const organizationsState = authClient.useListOrganizations()
const organizations = computed(() => unref(organizationsState)?.data ?? [])
const sites = ref<DashboardSite[]>([])
const billing = ref<ApiRecord | null>(null)
const sitesLoading = ref(false)

// Check onboarding status and redirect if needed
onMounted(async () => {
  try {
    const status = await $fetch<{ needsOnboarding: boolean }>('/api/onboarding/status')
    if (status.needsOnboarding) {
      await navigateTo('/dashboard/onboarding')
    }
  } catch (err) {
    console.error('Failed to check onboarding status:', err)
  }
})

const platformHostname = computed(() => {
  try {
    const domain = config.public.freeSiteDomain
    if (!domain) return ''
    return new URL(domain).hostname
  } catch {
    return ''
  }
})
const hasOrganization = computed(() => organizations.value.length > 0)
const loading = computed(() => Boolean(unref(organizationsState)?.isPending) || sitesLoading.value)

const siteUrlLabel = (site: DashboardSite) => {
  if (site.custom_domain) return site.custom_domain
  return `${site.subdomain}.${platformHostname.value}`
}

watch(organizations, async (newOrgs: typeof organizations.value) => {
  if (newOrgs.length === 0) {
    sites.value = []
    billing.value = null
    return
  }

  sitesLoading.value = true
  try {
    const [sitesResponse, billingResponse] = await Promise.all([
      $fetch<{ sites: DashboardSite[] }>('/api/sites'),
      $fetch<ApiRecord>('/api/billing/status')
    ])
    sites.value = sitesResponse.sites || []
    billing.value = billingResponse.billing
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
    sites.value = []
    billing.value = null
  } finally {
    sitesLoading.value = false
  }
}, { immediate: true })

useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })
</script>

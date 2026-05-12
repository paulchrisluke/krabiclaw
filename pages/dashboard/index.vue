<template>
  <UPage>
    <UPageHeader
      title="Dashboard"
      description="Your organization workspace for restaurant websites, billing, and integrations."
      :links="[{ label: 'Create Website', icon: 'i-heroicons-plus', to: '/dashboard/onboarding' }]"
    />

    <UPageBody>
      <div v-if="loading" class="grid gap-4">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <UCard v-else-if="!hasOrganization">
        <div class="mx-auto max-w-md py-10 text-center">
          <UIcon name="i-heroicons-building-storefront" class="mx-auto size-10 text-(--ui-text-muted)" />
          <h2 class="mt-4 text-xl font-semibold text-(--ui-text-highlighted)">Create your restaurant workspace</h2>
          <p class="mt-2 text-sm text-(--ui-text-muted)">Start with one website, then add locations for local menus, hours, and Google Business data.</p>
          <UButton to="/dashboard/onboarding" icon="i-heroicons-plus" color="primary" size="lg" class="mt-6">
            Get Started
          </UButton>
        </div>
      </UCard>

      <div v-else class="space-y-6">
        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Websites</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ sites.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Plan</p>
            <p class="mt-2 text-3xl font-semibold capitalize text-(--ui-text-highlighted)">{{ billing?.plan || 'Free' }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Google Business</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ connectedSitesCount }}</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-(--ui-text-highlighted)">Websites</h2>
                <p class="mt-1 text-sm text-(--ui-text-muted)">Choose a website to manage brand content, locations, menus, and launch settings.</p>
              </div>
              <UButton to="/dashboard/sites" color="neutral" variant="soft" icon="i-heroicons-squares-2x2">
                View All
              </UButton>
            </div>
          </template>

          <div v-if="sites.length === 0" class="py-8 text-center">
            <p class="font-medium text-(--ui-text-highlighted)">No websites yet</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">Create your first restaurant website to begin.</p>
            <UButton to="/dashboard/onboarding" icon="i-heroicons-plus" color="primary" class="mt-4">
              Create Website
            </UButton>
          </div>

          <div v-else class="divide-y divide-(--ui-border)">
            <NuxtLink
              v-for="site in sites.slice(0, 5)"
              :key="site.id"
              :to="`/dashboard/sites/${site.id}`"
              class="group flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate font-medium text-(--ui-text-highlighted)">{{ site.brand_name || site.name }}</p>
                  <UBadge :color="site.status === 'active' ? 'success' : 'warning'" variant="soft" size="xs">
                    {{ site.status }}
                  </UBadge>
                </div>
                <p class="mt-1 truncate text-sm text-(--ui-text-muted)">{{ siteUrlLabel(site) }}</p>
              </div>
              <UIcon name="i-heroicons-arrow-right" class="size-5 shrink-0 text-(--ui-text-muted) transition group-hover:text-(--ui-primary)" />
            </NuxtLink>
          </div>
        </UCard>

        <div class="grid gap-4 lg:grid-cols-3">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Billing</h2>
            </template>
            <p class="text-sm text-(--ui-text-muted)">Manage subscription, payment method, and plan limits.</p>
            <UButton to="/dashboard/billing" color="neutral" variant="soft" icon="i-heroicons-credit-card" block class="mt-4">
              Open Billing
            </UButton>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Integrations</h2>
            </template>
            <p class="text-sm text-(--ui-text-muted)">Connect organization-level services, then map them to websites and locations.</p>
            <UButton to="/dashboard/integrations" color="neutral" variant="soft" icon="i-heroicons-link" block class="mt-4">
              Open Integrations
            </UButton>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Settings</h2>
            </template>
            <p class="text-sm text-(--ui-text-muted)">Manage profile and organization preferences.</p>
            <UButton to="/dashboard/settings" color="neutral" variant="soft" icon="i-heroicons-cog-6-tooth" block class="mt-4">
              Open Settings
            </UButton>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'dashboard' })

interface DashboardSite {
  id: string
  name: string
  brand_name: string | null
  subdomain: string | null
  custom_domain: string | null
  status: string
}

const config = useRuntimeConfig()
const router = useRouter()
const organizationsState = authClient.useListOrganizations()
const organizations = computed(() => unref(organizationsState)?.data ?? [])
const sites = ref<DashboardSite[]>([])
const billing = ref<any>(null)
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
const connectedSitesCount = computed(() => 0)

const siteUrlLabel = (site: DashboardSite) => {
  if (site.custom_domain) return site.custom_domain
  return `${site.subdomain}.${platformHostname.value}`
}

watch(organizations, async newOrgs => {
  if (newOrgs.length === 0) {
    sites.value = []
    billing.value = null
    return
  }

  sitesLoading.value = true
  try {
    const [sitesResponse, billingResponse] = await Promise.all([
      $fetch<{ sites: DashboardSite[] }>('/api/sites'),
      $fetch<any>('/api/billing/status')
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

<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #right>
          <UButton v-if="canManageOrganization" icon="i-lucide-plus" label="Add site" size="sm" color="primary" variant="soft" :to="`/dashboard/${orgSlug}/sites/new`" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 3" :key="i" class="h-24 rounded-xl" />
      </div>

      <div v-else class="space-y-6">
        <UCard>
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-primary">Today</p>
              <h2 class="mt-1 text-xl font-semibold text-highlighted">Your workspace at a glance</h2>
              <p class="mt-1 text-sm text-muted">
                {{ liveSitesCount }} {{ liveSitesCount === 1 ? 'live site' : 'live sites' }} across {{ verticalCount }} {{ verticalCount === 1 ? 'vertical' : 'verticals' }}.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:min-w-72">
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">Live sites</p>
                <p class="mt-1 text-2xl font-semibold text-highlighted">{{ liveSitesCount }}</p>
              </div>
              <div class="rounded-lg border border-default bg-muted px-3 py-2">
                <p class="text-xs text-muted">Plans</p>
                <p class="mt-1 truncate text-sm font-semibold text-highlighted">{{ planSummary }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <div v-if="sitesWithSubdomain.length === 0" class="py-16 text-center">
          <UIcon name="i-lucide-globe" class="size-8 text-muted mx-auto mb-3" />
          <p class="text-sm text-muted">No sites available.</p>
          <UButton v-if="canManageOrganization" label="Add your first site" size="sm" color="primary" class="mt-4" :to="`/dashboard/${orgSlug}/sites/new`" />
        </div>

        <div v-else>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-highlighted">Sites</h2>
            <UButton
              v-if="sitesWithSubdomain.length > 3"
              :to="`/dashboard/${orgSlug}/sites`"
              size="sm"
              color="neutral"
              variant="ghost"
            >
              See all
            </UButton>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="s in previewSites"
              :key="s.id"
              :to="`/dashboard/${orgSlug}/sites/${s.subdomain}`"
              class="group block"
            >
              <UCard variant="soft" class="h-full cursor-pointer">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-highlighted truncate">{{ s.brand_name ?? s.subdomain }}</p>
                    <p class="text-xs text-muted">{{ verticalLabel(s.vertical) }} · {{ s.subdomain }}.krabiclaw.com</p>
                  </div>
                  <UBadge :label="s.plan ?? 'free'" color="neutral" variant="soft" size="xs" />
                </div>
              </UCard>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getVerticalLabel } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const dashboard = useDashboardSite()
const pending = ref(true)

const sites = computed(() => dashboard.sites.value)
const canManageOrganization = computed(() => ['owner', 'admin'].includes(dashboard.organization.value?.role ?? ''))
const sitesWithSubdomain = computed(() => sites.value.filter((site): site is (typeof sites.value)[number] & { subdomain: string } => Boolean(site.subdomain)))
const previewSites = computed(() => sitesWithSubdomain.value.slice(0, 3))
const liveSitesCount = computed(() => sitesWithSubdomain.value.filter(site => site.status === 'active' && site.onboarding_status === 'active').length)
const verticalCount = computed(() => new Set(sitesWithSubdomain.value.map(site => site.vertical ?? 'unknown')).size)
const planSummary = computed(() => {
  const plans = [...new Set(sitesWithSubdomain.value.map(site => site.plan ?? 'free'))]
  if (plans.length === 0) return 'No sites'
  if (plans.length === 1) return plans[0]!
  return `${plans.length} plans`
})

function verticalLabel(vertical: string | null) {
  return getVerticalLabel(vertical)
}

onMounted(async () => {
  try {
    await dashboard.refresh()
  } finally {
    pending.value = false
  }
})
</script>

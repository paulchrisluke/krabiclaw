<template>
  <UDashboardPanel id="org-sites">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #trailing>
          <UButton v-if="canManageOrganization" icon="i-lucide-plus" label="Add site" size="sm" color="primary" variant="soft" :to="`/dashboard/${orgSlug}/sites/new`" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 3" :key="i" class="h-24 rounded-xl" />
      </div>

      <div v-else-if="sites.length === 0" class="py-16 text-center">
        <UIcon name="i-lucide-globe" class="size-8 text-muted mx-auto mb-3" />
        <p class="text-sm text-muted">No sites available.</p>
        <UButton v-if="canManageOrganization" label="Add your first site" size="sm" color="primary" class="mt-4" :to="`/dashboard/${orgSlug}/sites/new`" />
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="s in sites"
          :key="s.id"
          :to="siteDashboardPath(s)"
          class="group block"
        >
          <UCard variant="soft" class="h-full cursor-pointer">
            <div class="flex gap-3">
              <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                <img
                  v-if="s.preview_image_url"
                  :src="s.preview_image_url"
                  :alt="`${s.brand_name ?? s.subdomain ?? 'Site'} preview`"
                  class="size-full object-cover"
                >
                <span v-else class="text-lg font-semibold text-muted">{{ (s.brand_name ?? s.subdomain ?? 'S').charAt(0).toUpperCase() }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-highlighted">{{ s.brand_name ?? s.subdomain ?? 'Untitled site' }}</p>
                <p class="truncate text-xs text-muted">{{ s.subdomain ? `${s.subdomain}.krabiclaw.com` : 'Setup in progress' }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <UBadge :label="formatSiteVertical(s.vertical)" color="neutral" variant="soft" size="xs" />
                  <UBadge
                    :label="getDashboardSiteStatus(s).label"
                    :color="getDashboardSiteStatus(s).color"
                    :icon="getDashboardSiteStatus(s).icon"
                    variant="soft"
                    size="xs"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </NuxtLink>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getDashboardSiteStatus } from '~/utils/dashboard-site-presentation'
import { getVerticalLabel } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Sites | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const dashboard = useDashboardSite()
const pending = dashboard.pending

const sites = computed(() => dashboard.sites.value)
const canManageOrganization = computed(() => ['owner', 'admin'].includes(dashboard.organization.value?.role ?? ''))
function formatSiteVertical(vertical: string | null) {
  if (!vertical) return 'Site'
  return getVerticalLabel(vertical)
}

function siteDashboardPath(site: (typeof sites.value)[number]) {
  return site.subdomain
    ? `/dashboard/${orgSlug}/sites/${site.subdomain}`
    : `/dashboard/${orgSlug}/onboarding`
}
</script>

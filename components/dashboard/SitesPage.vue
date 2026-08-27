<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #leading><DashboardNavbarLeading /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-6">
        <USkeleton class="h-9 w-40 rounded-lg" />
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <USkeleton v-for="i in 2" :key="i" class="aspect-[40/21] rounded-2xl" />
        </div>
      </div>

      <div v-else class="space-y-8">
        <div v-if="sites.length === 0" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
          <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
            <UIcon name="i-lucide-globe" class="size-6 text-muted" />
          </div>
          <h2 class="mt-5 text-base font-semibold text-highlighted">No sites available</h2>
          <p class="mt-2 text-sm text-muted">Your organization’s sites will appear here.</p>
          <UButton
            v-if="canManageOrganization"
            label="Add your first site"
            icon="i-lucide-plus"
            class="mt-6"
            :to="`/dashboard/${orgSlug}/sites/new`"
          />
        </div>

        <DashboardSiteLocationSelector
          v-else
          :items="selectorItems"
          :add-action="addSiteAction"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardSiteLocationSelector from '~/components/dashboard/SiteLocationSelector.vue'

useSeoMeta({ title: 'Your sites | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const orgSlug = computed(() => String(route.params.orgSlug || ''))
const dashboard = useDashboardSite()
const pending = dashboard.pending

const sites = computed(() => dashboard.sites.value)
const canManageOrganization = computed(() => ['owner', 'admin'].includes(dashboard.organization.value?.role ?? ''))
const addSiteAction = computed(() => canManageOrganization.value
  ? { label: 'Add a site', to: '/dashboard/' + orgSlug.value + '/sites/new' }
  : undefined)
const selectorItems = computed(() => sites.value.map(site => ({
  id: site.id,
  label: site.brand_name ?? site.subdomain ?? site.id,
  imageUrl: site.media.find(item => item.slot === 'media')?.thumbnail_url
    || site.media.find(item => item.slot === 'media')?.public_url
    || null,
  to: siteDashboardPath(site),
})))

function siteDashboardPath(site: (typeof sites.value)[number]) {
  return site.subdomain
    ? `/dashboard/${orgSlug.value}/sites/${site.subdomain}`
    : `/dashboard/${orgSlug.value}/onboarding`
}
</script>

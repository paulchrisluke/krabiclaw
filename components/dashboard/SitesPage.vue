<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #right>
          <UButton
            v-if="canManageOrganization"
            :to="`/dashboard/${orgSlug}/sites/new`"
            icon="i-lucide-plus"
            color="neutral"
            variant="soft"
            square
            aria-label="Add a site"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        The skeleton uses the selector's own grid and card ratio. When it had its
        own column rule and aspect, the page visibly jumped the moment the sites
        loaded — a placeholder that does not reserve the real space is worse than
        none.
      -->
      <div v-if="pending" class="space-y-6">
        <USkeleton class="h-9 w-40 rounded-lg" />
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-6">
          <USkeleton v-for="i in 2" :key="i" class="aspect-[4/3] rounded-2xl sm:aspect-[16/10]" />
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
const selectorItems = computed(() => sites.value.map(site => ({
  id: site.id,
  label: site.brand_name ?? site.subdomain ?? site.id,
  imageUrl: site.social_image?.url ?? null,
  eyebrow: verticalLabel(site.vertical),
  summary: site.subdomain ? `${site.subdomain}.krabiclaw.com` : 'Website setup in progress',
  to: siteDashboardPath(site),
})))

function verticalLabel(vertical: (typeof sites.value)[number]['vertical']) {
  if (vertical === 'restaurant') return 'Restaurant'
  if (vertical === 'experience') return 'Experiences'
  if (vertical === 'professional_service' || vertical === 'service') return 'Professional services'
  return 'Website'
}

function siteDashboardPath(site: (typeof sites.value)[number]) {
  return site.subdomain
    ? `/dashboard/${orgSlug.value}/sites/${site.subdomain}`
    : `/dashboard/${orgSlug.value}/onboarding`
}
</script>

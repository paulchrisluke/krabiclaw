<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Your sites">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
        <template #right>
          <UButton
            v-if="canManageOrganization"
            icon="i-lucide-plus"
            label="Add site"
            size="sm"
            color="primary"
            variant="soft"
            :to="`/dashboard/${orgSlug}/sites/new`"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-6">
        <USkeleton class="h-9 w-40 rounded-lg" />
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <USkeleton v-for="i in 3" :key="i" class="aspect-[4/3] rounded-2xl" />
        </div>
      </div>

      <div v-else class="site-picker-layout space-y-8">
        <div v-if="sitesWithSubdomain.length === 0" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
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

        <div v-else class="site-picker-grid">
          <NuxtLink
            v-for="site in sitesWithSubdomain"
            :key="site.id"
            :to="`/dashboard/${orgSlug}/sites/${site.subdomain}`"
            class="group min-w-0"
          >
            <article>
              <div class="relative aspect-[4/3] overflow-hidden rounded-2xl border border-default bg-elevated shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                <NuxtImg
                  v-if="site.preview_image_url"
                  :src="site.preview_image_url"
                  :alt="`${site.brand_name ?? site.subdomain} preview`"
                  class="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <div v-else class="flex size-full items-center justify-center bg-muted">
                  <span class="text-6xl font-semibold text-dimmed">{{ siteInitial(site) }}</span>
                </div>

                <UBadge
                  :label="getDashboardSiteStatus(site).label"
                  :color="getDashboardSiteStatus(site).color"
                  :icon="getDashboardSiteStatus(site).icon"
                  variant="soft"
                  class="absolute left-4 top-4"
                />
              </div>

              <div class="mt-4 min-w-0">
                <h2 class="truncate text-base font-semibold text-highlighted">{{ site.brand_name ?? site.subdomain }}</h2>
                <p class="mt-1 truncate text-sm text-muted">
                  {{ verticalLabel(site.vertical) }} · {{ site.subdomain }}.krabiclaw.com
                </p>
              </div>
            </article>
          </NuxtLink>

          <NuxtLink
            v-if="canManageOrganization"
            :to="`/dashboard/${orgSlug}/sites/new`"
            class="group min-w-0"
          >
            <article>
              <div class="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-default bg-elevated transition group-hover:-translate-y-0.5 group-hover:border-primary group-hover:bg-muted">
                <div class="flex size-14 items-center justify-center rounded-full border border-default bg-default shadow-sm">
                  <UIcon name="i-lucide-plus" class="size-6 text-muted transition group-hover:text-primary" />
                </div>
              </div>
              <h2 class="mt-4 text-base font-semibold text-highlighted">Add a site</h2>
              <p class="mt-1 text-sm text-muted">Create another site for this organization</p>
            </article>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getDashboardSiteStatus } from '~/utils/dashboard-site-presentation'
import { getVerticalLabel } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Your sites | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const dashboard = useDashboardSite()
const pending = ref(true)

const sites = computed(() => dashboard.sites.value)
const canManageOrganization = computed(() => ['owner', 'admin'].includes(dashboard.organization.value?.role ?? ''))
const sitesWithSubdomain = computed(() => sites.value.filter((site): site is (typeof sites.value)[number] & { subdomain: string } => Boolean(site.subdomain)))

function siteInitial(site: (typeof sites.value)[number]) {
  return (site.brand_name ?? site.subdomain ?? 'S').trim().charAt(0).toUpperCase()
}

function verticalLabel(vertical: string | null) {
  return getVerticalLabel(vertical)
}

pending.value = false
</script>

<style scoped>
.site-picker-layout {
  container-type: inline-size;
}

.site-picker-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: 1.5rem;
  row-gap: 2.25rem;
}

@container (min-width: 36rem) {
  .site-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 64rem) {
  .site-picker-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>

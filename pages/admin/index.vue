<template>
  <UDashboardPanel id="admin-organizations">
    <template #header>
      <UDashboardNavbar title="Organizations">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing>
          <UButton icon="i-lucide-refresh-cw" aria-label="Refresh organizations" color="neutral" variant="ghost" size="xs" :loading="loading" @click="loadOrganizations" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UPage>
        <UPageBody class="space-y-4">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search organizations, sites, or locations" class="w-full max-w-lg" />

          <UCard v-if="loading">
            <div class="space-y-3"><USkeleton v-for="index in 4" :key="index" class="h-20 rounded-lg" /></div>
          </UCard>

          <UCard v-else-if="filteredOrganizations.length === 0">
            <p class="text-sm text-muted">No organizations match your search.</p>
          </UCard>

          <template v-else>
          <UCard v-for="organization in filteredOrganizations" :key="organization.id">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="font-semibold text-highlighted">{{ organization.name }}</p>
                  <p class="text-xs text-muted">{{ organization.slug || organization.id }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge color="neutral" variant="soft" :label="`${organization.sites.length} ${organization.sites.length === 1 ? 'site' : 'sites'}`" />
                  <UButton
                    label="Enter"
                    icon="i-lucide-log-in"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    :disabled="!organization.slug || !organization.impersonationUserId"
                    :loading="impersonatingId === organization.id"
                    @click="enterOrganization(organization)"
                  />
                </div>
              </div>
            </template>

            <div v-if="organization.sites.length" class="space-y-3">
              <UCard v-for="site in organization.sites" :key="site.id" class="shadow-none">
                <div class="space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium text-highlighted">{{ site.name }}</p>
                      <p class="text-xs text-muted">{{ site.subdomain || site.slug }}</p>
                    </div>
                    <UBadge :color="site.status === 'active' ? 'success' : 'neutral'" variant="soft" :label="site.status || 'unknown'" />
                  </div>

                  <div v-if="site.locations.length" class="divide-y divide-default border-t border-default">
                    <div v-for="location in site.locations" :key="location.id" class="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-3 last:pb-0">
                      <div class="flex min-w-0 items-center gap-2">
                        <UIcon name="i-lucide-map-pin" class="size-4 shrink-0 text-muted" />
                        <div class="min-w-0">
                          <p class="truncate text-sm text-default">{{ location.title }}</p>
                          <p class="truncate text-xs text-muted">{{ location.city || location.slug }}</p>
                        </div>
                      </div>
                      <UBadge v-if="location.isPrimary" color="primary" variant="subtle" label="Primary" />
                    </div>
                  </div>
                  <p v-else class="text-xs text-muted">No locations.</p>
                </div>
              </UCard>
            </div>
            <p v-else class="text-sm text-muted">No sites.</p>
          </UCard>
          </template>
        </UPageBody>
      </UPage>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organizations | KrabiClaw Admin', robots: 'noindex, nofollow' })

interface AdminLocation { id: string; slug: string; title: string; city: string | null; isPrimary: boolean }
interface AdminSite { id: string; slug: string; name: string; subdomain: string | null; status: string | null; locations: AdminLocation[] }
interface AdminOrganization { id: string; name: string; slug: string | null; impersonationUserId: string | null; sites: AdminSite[] }

const toast = useToast()
const { refreshSession } = useAuth()
const organizations = ref<AdminOrganization[]>([])
const loading = ref(true)
const search = ref('')
const impersonatingId = ref<string | null>(null)

const filteredOrganizations = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return organizations.value
  return organizations.value.filter(organization => [
    organization.name,
    organization.slug,
    ...organization.sites.flatMap(site => [site.name, site.slug, site.subdomain, ...site.locations.flatMap(location => [location.title, location.slug, location.city])]),
  ].some(value => value?.toLowerCase().includes(query)))
})

async function loadOrganizations() {
  loading.value = true
  try {
    const response = await applicationFetch<{ organizations: AdminOrganization[] }>('/api/admin/overview', {
      validate: (value): value is { organizations: AdminOrganization[] } => isRecord(value) && Array.isArray(value.organizations),
    })
    organizations.value = response.organizations
  } catch {
    toast.add({ title: 'Failed to load organizations', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function enterOrganization(organization: AdminOrganization) {
  if (!organization.slug || !organization.impersonationUserId || impersonatingId.value) return
  impersonatingId.value = organization.id
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.admin.impersonateUser({ userId: organization.impersonationUserId })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo(`/dashboard/${organization.slug}`)
  } catch {
    toast.add({ title: 'Failed to enter organization workspace', color: 'error' })
  } finally {
    impersonatingId.value = null
  }
}

onMounted(loadOrganizations)
</script>

<template>
  <UDashboardPanel id="admin-organization-sites">
    <template #header>
      <UDashboardNavbar :title="data?.organization.name || 'Organization'">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing>
          <div class="flex gap-1">
            <UButton label="Enter workspace" icon="i-lucide-log-in" color="neutral" variant="soft" size="xs" :disabled="!data?.organization.impersonationUserId" :loading="impersonating" @click="openWorkspace" />
            <UButton to="/admin" label="Organizations" color="neutral" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <div v-if="loading" class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" /></div>
        <template v-else-if="data">
          <div>
            <p class="text-sm text-muted">{{ data.organization.slug || data.organization.id }}</p>
            <h2 class="mt-1 text-xl font-semibold text-highlighted">Sites</h2>
          </div>
          <UTable :data="data.sites" :columns="siteColumns" :loading="loading" empty="This organization has no sites.">
            <template #brandName-cell="{ row }"><div><p class="font-semibold text-highlighted">{{ row.original.brandName || row.original.slug }}</p><p class="text-xs text-muted">{{ row.original.customDomain || (row.original.subdomain ? `${row.original.subdomain}.krabiclaw.com` : row.original.slug) }}</p></div></template>
            <template #plan-cell="{ row }"><UBadge :label="row.original.plan || 'free'" color="neutral" variant="soft" size="xs" /></template>
            <template #pageViews30d-cell="{ row }">{{ formatNumber(row.original.pageViews30d) }}</template>
            <template #sessions30d-cell="{ row }">{{ formatNumber(row.original.sessions30d) }}</template>
            <template #actions-cell="{ row }"><UButton :to="`/admin/organizations/${orgId}/sites/${row.original.id}`" label="View" icon="i-lucide-chevron-right" trailing color="neutral" variant="ghost" size="xs" /></template>
          </UTable>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organization sites | KrabiClaw Admin', robots: 'noindex, nofollow' })
const route = useRoute()
const toast = useToast()
const orgId = computed(() => String(route.params.orgId || ''))
interface Site { id: string; slug: string; brandName: string | null; subdomain: string | null; customDomain: string | null; plan: string | null; locationCount: number; pageViews30d: number; sessions30d: number }
interface Response { organization: { id: string; name: string; slug: string | null; impersonationUserId: string | null }; sites: Site[] }
const data = ref<Response | null>(null)
const loading = ref(true)
const impersonating = ref(false)
const { refreshSession } = useAuth()
const siteColumns = [
  { accessorKey: 'brandName', header: 'Site' },
  { accessorKey: 'plan', header: 'Plan' },
  { accessorKey: 'locationCount', header: 'Locations' },
  { accessorKey: 'pageViews30d', header: '30d views' },
  { accessorKey: 'sessions30d', header: 'Sessions' },
  { id: 'actions', header: '' },
]
function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
async function openWorkspace() {
  const organization = data.value?.organization
  if (!organization?.slug || !organization.impersonationUserId || impersonating.value) return
  impersonating.value = true
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.admin.impersonateUser({ userId: organization.impersonationUserId })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo(`/dashboard/${organization.slug}`)
  } catch { toast.add({ title: 'Failed to enter organization workspace', color: 'error' }) }
  finally { impersonating.value = false }
}
onMounted(async () => {
  try {
    data.value = await applicationFetch<Response>(`/api/admin/portfolio/${orgId.value}`, { validate: (value): value is Response => isRecord(value) && isRecord(value.organization) && Array.isArray(value.sites) })
  } catch { toast.add({ title: 'Failed to load organization', color: 'error' }) }
  finally { loading.value = false }
})
</script>

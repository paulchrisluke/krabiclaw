<template>
  <UDashboardPanel id="organization-settings">
    <template #header>
      <UDashboardNavbar title="Organization Settings">
        <template #leading><DashboardSidebarCollapseButton /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto max-w-4xl space-y-6">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Organization</h2>
              <p class="mt-1 text-sm text-muted">The ownership boundary for sites, members, billing, and connected services.</p>
            </div>
          </template>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Organization name">
              <UInput v-model="name" :disabled="!canManage" />
            </UFormField>
            <UFormField label="Your role">
              <UInput :model-value="organization?.role || ''" readonly class="capitalize" />
            </UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end">
              <UButton v-if="canManage" :loading="saving" :disabled="!dirty" @click="save">Save organization</UButton>
            </div>
          </template>
        </UCard>

        <div class="grid gap-4 sm:grid-cols-2">
          <UCard v-for="item in managementLinks" :key="item.to">
            <div class="flex items-start gap-3">
              <UIcon :name="item.icon" class="mt-0.5 size-5 text-primary" />
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-highlighted">{{ item.label }}</h3>
                <p class="mt-1 text-sm text-muted">{{ item.description }}</p>
                <UButton class="mt-4" size="sm" color="neutral" variant="outline" :to="item.to">Open</UButton>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

const route = useRoute()
const toast = useToast()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const organization = dashboard.organization
if (!['owner', 'admin'].includes(organization.value?.role ?? '')) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}
const name = ref(organization.value?.name ?? '')
const saving = ref(false)
const canManage = computed(() => organization.value?.role === 'owner' || organization.value?.role === 'admin')
const dirty = computed(() => Boolean(name.value.trim()) && name.value.trim() !== organization.value?.name)
const orgBase = computed(() => `/dashboard/${String(route.params.orgSlug)}`)
const managementLinks = computed(() => [
  { label: 'Members', description: 'Invite people and manage their organization membership.', icon: 'i-lucide-users', to: `${orgBase.value}/settings/members` },
  { label: 'Billing', description: 'Manage plans, payment methods, and organization credits.', icon: 'i-lucide-credit-card', to: `${orgBase.value}/settings/billing` },
  { label: 'Domains', description: 'Manage domains owned by sites in this organization.', icon: 'i-lucide-globe', to: `${orgBase.value}/settings/domains` },
  { label: 'Analytics', description: 'Choose a site and configure its analytics connection.', icon: 'i-lucide-chart-bar', to: `${orgBase.value}/settings/analytics` },
  { label: 'ChatGPT', description: 'Configure the organization ChatGPT connection.', icon: 'i-lucide-message-square', to: `${orgBase.value}/settings/chatgpt` },
])

async function save() {
  if (!organization.value || !dirty.value) return
  saving.value = true
  try {
    const { error } = await authClient.organization.update({ organizationId: organization.value.id, data: { name: name.value.trim() } })
    if (error) throw new Error(error.message || 'Failed to update organization')
    await dashboard.refresh()
    name.value = dashboard.organization.value?.name ?? name.value.trim()
    toast.add({ description: 'Organization updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update organization', color: 'error' })
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'Organization Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>

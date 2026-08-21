<template>
  <OrganizationSettingsShell
    :detail-title="isGeneralRoute ? 'General' : undefined"
    :show-actions="isGeneralRoute"
    :saving="saving"
    :save-disabled="!dirty"
    @cancel="cancel"
    @save="save"
  >
    <div v-if="isGeneralRoute" class="space-y-8">
      <p class="text-base text-muted">The ownership boundary for sites, members, billing, and connected services.</p>
      <UFormField label="Organization name">
        <UInput v-model="name" :disabled="!canManage" size="xl" autofocus class="w-full" />
      </UFormField>
      <div>
        <p class="text-sm font-medium text-highlighted">Your role</p>
        <p class="mt-2 capitalize text-muted">{{ organization?.role || 'Not available' }}</p>
      </div>
    </div>
  </OrganizationSettingsShell>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import OrganizationSettingsShell from '~/components/dashboard/OrganizationSettingsShell.vue'

const route = useRoute()
const router = useRouter()
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
const settingsPath = computed(() => `${orgBase.value}/settings`)
const isGeneralRoute = computed(() => route.path === `${settingsPath.value}/general`)

let organizationLoadToken = 0
watch(() => route.params.orgSlug, async (nextOrgSlug, previousOrgSlug) => {
  if (nextOrgSlug === previousOrgSlug) return
  const token = ++organizationLoadToken
  await dashboard.refresh()
  if (token !== organizationLoadToken) return
  if (!['owner', 'admin'].includes(organization.value?.role ?? '')) {
    await router.replace(`/dashboard/${String(nextOrgSlug)}`)
    return
  }
  name.value = organization.value?.name ?? ''
})

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

function cancel() {
  name.value = organization.value?.name ?? ''
}

useSeoMeta({ title: 'Organization Settings | KrabiClaw', robots: 'noindex, nofollow' })
</script>

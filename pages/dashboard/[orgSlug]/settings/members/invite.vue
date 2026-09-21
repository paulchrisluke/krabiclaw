<template>
  <DashboardLeafPanel
    id="organization-members-invite"
    title="Invite a team member"
    save-label="Send invite"
    :saving="inviting"
    :disabled="!inviteForm.email.trim() || (inviteForm.role === 'editor' && !inviteForm.siteId)"
    :error="inviteError ?? ''"
    @cancel="resetInvite"
    @save="sendInvite"
  >
    <div class="space-y-6">
      <UFormField label="Email address" required>
        <UInput v-model="inviteForm.email" type="email" placeholder="teammate@example.com" size="xl" autofocus class="w-full" />
      </UFormField>
      <UFormField label="Role">
        <USelect v-model="inviteForm.role" :items="roleOptions" size="xl" class="w-full" />
      </UFormField>
      <template v-if="inviteForm.role === 'editor'">
        <UFormField label="Site" description="Which site can this editor access?">
          <USelect v-model="inviteForm.siteId" :items="scope.siteOptions.value" :loading="scope.sitesPending.value" placeholder="Select a site" size="xl" class="w-full" />
        </UFormField>
        <UFormField label="Location" description="Leave unset for the whole site (site manager).">
          <USelect v-model="inviteForm.locationId" :items="inviteLocations.options.value" :loading="inviteLocations.pending.value" :disabled="!inviteForm.siteId" placeholder="Whole site" size="xl" class="w-full" />
        </UFormField>
      </template>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { organizationMembersKey } from '~/utils/organization-members'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const dashboard = useDashboardSite()

const isOwner = computed(() => dashboard.organization.value?.role === 'owner')
const BASE_ROLE_OPTIONS = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
]
// Owner is offered only to an owner, as Better Auth's creatorRole rule has it; enforced again server-side.
const roleOptions = computed(() => (isOwner.value ? [...BASE_ROLE_OPTIONS, { label: 'Owner', value: 'owner' }] : BASE_ROLE_OPTIONS))

const inviteForm = reactive({ email: '', role: 'member', siteId: '', locationId: '' })
const inviting = ref(false)
const inviteError = ref<string | null>(null)

const scope = useOrganizationScopeOptions()
const inviteLocations = scope.locationsFor(computed(() => inviteForm.siteId))
watch(() => inviteForm.role, (role) => { if (role === 'editor') void scope.loadSites() })
watch(() => inviteForm.siteId, () => { inviteForm.locationId = '' })
watch([scope.sitesError, inviteLocations.error], ([sites, locations]) => { inviteError.value = locations ?? sites })

function resetInvite() {
  Object.assign(inviteForm, { email: '', role: 'member', siteId: '', locationId: '' })
  inviteError.value = null
}

async function sendInvite() {
  if (inviteForm.role === 'editor' && !inviteForm.siteId) {
    inviteError.value = 'Pick a site for this editor before sending.'
    return
  }
  inviting.value = true
  inviteError.value = null
  try {
    const organizationId = dashboard.organization.value?.id
    if (!organizationId) throw new Error('Organization context is unavailable')
    const selectedSite = scope.sites.value.find(site => site.id === inviteForm.siteId)
    const selectedLocation = inviteLocations.locations.value.find(location => location.id === inviteForm.locationId)
    // A location team narrows the site team; an editor with neither has access to nothing.
    const teamId = inviteForm.role === 'editor' ? (selectedLocation ? selectedLocation.team_id : selectedSite?.team_id) ?? undefined : undefined
    if (inviteForm.role === 'editor' && !teamId) throw new Error('The selected site or location has no Better Auth team')
    const result = await authClient.organization.inviteMember({
      email: inviteForm.email,
      role: inviteForm.role as 'member' | 'admin' | 'editor' | 'owner',
      organizationId,
      teamId,
    })
    if (result.error) throw new Error(result.error.message || 'Failed to send invite.')
    resetInvite()
    await refreshNuxtData(organizationMembersKey(String(route.params.orgSlug ?? '')))
    await navigateTo(level.to.value ?? '/dashboard')
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Failed to send invite.'
  } finally {
    inviting.value = false
  }
}
</script>

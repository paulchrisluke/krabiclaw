<template>
  <!--
    Inside the settings pair this level is the list. Inviting is its own leaf:
    the settings level yields, and this one draws the list as its index column
    with the invitation as the detail.
  -->
  <OrganizationMembersList v-if="frame.mode.value === 'index'" />

  <UDashboardPanel v-else id="organization-members" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar title="Members" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="settingsPath" label="Settings" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        detail-title="Invite a team member"
        :dismiss-to="membersPath"
        wide-detail
        show-actions
        :saving="inviting"
        :save-disabled="!inviteForm.email.trim() || (inviteForm.role === 'editor' && !inviteForm.siteId)"
        save-label="Send invite"
        @cancel="closeInvite"
        @save="sendInvite"
      >
        <template #index>
          <OrganizationMembersList />
        </template>
        <template #detail>
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
            <UAlert v-if="inviteError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="inviteError" />
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import OrganizationMembersList from '~/components/dashboard/OrganizationMembersList.vue'
import { authClient } from '~/lib/auth-client'
import { organizationMembersKey } from '~/utils/organization-members'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const toast = useToast()
const { orgPaths } = useDashboardSiteLinks()
const settingsPath = computed(() => orgPaths.value.settings)
const membersPath = computed(() => `${settingsPath.value}/members`)
const frame = useEditorFrame(membersPath)

const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()

watchEffect(() => {
  if (frame.rest.value.length > 1 || (frame.childSegment.value && frame.childSegment.value !== 'invite')) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

// ── Inviting ────────────────────────────────────────────
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

async function closeInvite() {
  resetInvite()
  await navigateTo(membersPath.value)
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
    toast.add({ description: 'Invitation sent.', color: 'success' })
    await refreshNuxtData(organizationMembersKey(String(route.params.orgSlug ?? '')))
    await navigateTo(membersPath.value)
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Failed to send invite.'
  } finally {
    inviting.value = false
  }
}

useSeoMeta({ title: 'Members | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<template>
  <div class="space-y-4">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-semibold text-highlighted">Team</h2>
              <p class="mt-1 text-sm text-muted">People with access to this organization.</p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :label="`${members.length} member${members.length === 1 ? '' : 's'}`" color="neutral" variant="soft" />
              <UButton icon="i-lucide-plus" color="neutral" variant="soft" square aria-label="Invite a team member" :to="`${membersPath}/invite`" />
            </div>
          </div>
        </template>

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-14 rounded-lg" />
        </div>

        <div v-else-if="members.length" class="divide-y divide-default">
          <div
            v-for="member in members"
            :key="member.id"
            class="py-4 first:pt-0 last:pb-0 space-y-3"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex min-w-0 items-center gap-3">
                <UAvatar
                  :src="member.image || undefined"
                  :alt="member.name || member.email"
                  icon="i-lucide-user"
                />
                <div class="min-w-0">
                  <p class="truncate font-medium text-highlighted">{{ member.name || member.email }}</p>
                  <p class="truncate text-sm text-muted">{{ member.email }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <USelect
                  v-if="canEditMemberRole(member)"
                  :model-value="member.role"
                  :items="roleOptionsFor(member)"
                  size="xs"
                  class="w-32 capitalize"
                  :loading="roleUpdatingId === member.id"
                  @update:model-value="value => onRoleSelected(member, String(value))"
                />
                <UBadge v-else :label="member.role" color="neutral" variant="soft" class="capitalize" />
                <UButton
                  v-if="member.role !== 'owner'"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="removingMemberId === member.id"
                  :aria-label="`Remove ${member.name || member.email}`"
                  @click="removeMember(member.id)"
                />
              </div>
            </div>

            <div v-if="editingRoleMemberId === member.id" class="flex flex-col gap-4 sm:flex-row sm:items-end">
              <UFormField label="Site" description="Which site can this editor access?" class="flex-1">
                <USelect
                  v-model="memberRoleForm.siteId"
                  :items="siteOptions"
                  :loading="sitesPending"
                  placeholder="Select a site"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Location" description="Leave unset for the whole site." class="flex-1">
                <USelect
                  v-model="memberRoleForm.locationId"
                  :items="memberRoleLocationOptions"
                  :loading="memberRoleLocationsPending"
                  :disabled="!memberRoleForm.siteId"
                  placeholder="Whole site"
                  class="w-full"
                />
              </UFormField>
              <div class="flex gap-2">
                <UButton
                  label="Save"
                  color="primary"
                  size="sm"
                  :loading="roleUpdatingId === member.id"
                  :disabled="!memberRoleForm.siteId"
                  @click="submitEditorRoleChange(member)"
                />
                <UButton label="Cancel" color="neutral" variant="ghost" size="sm" @click="cancelRoleEdit" />
              </div>
            </div>

            <UAlert
              v-if="roleUpdateError && roleUpdateErrorMemberId === member.id"
              color="error"
              variant="soft"
              :description="roleUpdateError"
            />

          </div>
        </div>

        <UAlert
          v-else
          color="neutral"
          variant="soft"
          icon="i-lucide-users"
          description="No members found for this organization."
        />

        <UAlert
          v-if="memberError"
          class="mt-4"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="memberError"
        />
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-semibold text-highlighted">Pending Invitations</h2>
              <p class="mt-1 text-sm text-muted">Invites that have not been accepted yet.</p>
            </div>
            <UBadge :label="`${invitations.length} pending`" color="neutral" variant="soft" />
          </div>
        </template>

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="i in 2" :key="i" class="h-14 rounded-lg" />
        </div>

        <div v-else-if="invitations.length" class="divide-y divide-default">
          <div
            v-for="invitation in invitations"
            :key="invitation.id"
            class="py-4 first:pt-0 last:pb-0 space-y-3"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">
                  {{ invitation.email }}
                </p>
                <p class="truncate text-sm text-muted">
                  <template v-if="invitation.inviterName">Invited by {{ invitation.inviterName }} · </template>Expires {{ formatDate(invitation.expiresAt) }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="invitation.role" :label="invitation.role" color="neutral" variant="soft" class="capitalize" />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="cancellingInviteId === invitation.id"
                  :aria-label="`Cancel invitation for ${invitation.email}`"
                  @click="cancelInvitation(invitation.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <UAlert
          v-else
          color="neutral"
          variant="soft"
          icon="i-lucide-mail"
          description="No pending invitations."
        />

        <UAlert
          v-if="pendingInvitationError"
          class="mt-4"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="pendingInvitationError"
        />
      </UCard>
  </div>
</template>

<script setup lang="ts">
import { formatTimestamp } from '~/utils/timezone'

import { authClient } from '~/lib/auth-client'
import { organizationMembersKey } from '~/utils/organization-members'

const dashboardApi = useDashboardApi()

interface MemberRow {
  id: string
  role: string
  createdAt: string
  userId: string
  name: string | null
  email: string
  image: string | null
}

interface InvitationRow {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: string
  createdAt: string
  inviterName: string | null
}

const isMembersResponse = (
  value: unknown,
): value is { members: MemberRow[]; invitations: InvitationRow[] } =>
  isRecord(value)
  && Array.isArray(value.members)
  && value.members.every(member => isRecord(member) && typeof member.id === 'string')
  && Array.isArray(value.invitations)
  && value.invitations.every(invitation => isRecord(invitation) && typeof invitation.id === 'string')

const route = useRoute()
const dashboard = useDashboardSite()
const { orgPaths } = useDashboardSiteLinks()
const membersPath = computed(() => `${orgPaths.value.settings}/members`)
const requestEvent = useRequestEvent()
const membersKey = computed(() => organizationMembersKey(String(route.params.orgSlug ?? '')))

const { data, pending, refresh } = await useAsyncData(
  membersKey,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) return null
      const [{ cloudflareEnv }, { getAuthSession }, { getOrganizationMembersData }, { resolveUserOrganization }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/auth'),
        import('~/server/utils/dashboard-members'),
        import('~/server/utils/member-access'),
      ])
      const env = cloudflareEnv(requestEvent)
      const session = await getAuthSession(requestEvent, env)
      if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
      const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      if (!orgSlug) throw createError({ statusCode: 400, statusMessage: 'Organization slug is required' })
      const org = await resolveUserOrganization(env, { userId: session.user.id, organizationSlug: orgSlug })
      if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
      return await getOrganizationMembersData(env, org.id)
    }
    return await dashboardApi<{ members: MemberRow[]; invitations: InvitationRow[] }>(
      '/api/dashboard/members',
      { validate: isMembersResponse },
    )
  },
)

const members = computed(() => data.value?.members ?? [])
const invitations = computed(() => data.value?.invitations ?? [])

const { user: currentUser } = await useAuthSession()
const currentUserRole = computed(() => {
  const match = members.value.find(member => member.userId === currentUser.value?.id)
  return match?.role ?? null
})
const isOwner = computed(() => currentUserRole.value === 'owner')

const BASE_ROLE_OPTIONS = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
]
// Owner is only offered as a choice to an existing owner — mirrors Better
// Auth's own creatorRole rule (only an owner can grant/touch the owner role),
// enforced again server-side since this is just UI affordance.
const roleOptions = computed(() => (
  isOwner.value ? [...BASE_ROLE_OPTIONS, { label: 'Owner', value: 'owner' }] : BASE_ROLE_OPTIONS
))

function roleOptionsFor(member: MemberRow) {
  return isOwner.value || member.role !== 'owner' ? roleOptions.value : BASE_ROLE_OPTIONS
}

function canEditMemberRole(member: MemberRow): boolean {
  if (currentUserRole.value !== 'owner' && currentUserRole.value !== 'admin') return false
  // Only an owner may touch another owner's role.
  if (member.role === 'owner' && !isOwner.value) return false
  return true
}

const removingMemberId = ref<string | null>(null)
const cancellingInviteId = ref<string | null>(null)
const memberError = ref<string | null>(null)
const pendingInvitationError = ref<string | null>(null)

const editingRoleMemberId = ref<string | null>(null)
const memberRoleForm = reactive({ siteId: '', locationId: '' })
const scope = useOrganizationScopeOptions()
const { siteOptions, sitesPending } = scope
const memberRoleLocations = scope.locationsFor(computed(() => memberRoleForm.siteId))
const memberRoleLocationOptions = memberRoleLocations.options
const memberRoleLocationsPending = memberRoleLocations.pending
watch(() => memberRoleForm.siteId, () => { memberRoleForm.locationId = '' })
watch(memberRoleLocations.error, (message) => {
  if (!message) return
  roleUpdateError.value = message
  roleUpdateErrorMemberId.value = editingRoleMemberId.value
})
watch(scope.sitesError, (message) => {
  if (!message || !editingRoleMemberId.value) return
  roleUpdateError.value = message
  roleUpdateErrorMemberId.value = editingRoleMemberId.value
})
const roleUpdatingId = ref<string | null>(null)
const roleUpdateError = ref<string | null>(null)
const roleUpdateErrorMemberId = ref<string | null>(null)

function cancelRoleEdit() {
  editingRoleMemberId.value = null
  memberRoleForm.siteId = ''
  memberRoleForm.locationId = ''
}

function onRoleSelected(member: MemberRow, role: string) {
  roleUpdateError.value = null
  roleUpdateErrorMemberId.value = null
  if (role === member.role) return
  if (role === 'editor') {
    editingRoleMemberId.value = member.id
    memberRoleForm.siteId = ''
    memberRoleForm.locationId = ''
    void scope.loadSites()
    return
  }
  void submitRoleChange(member, role)
}

async function submitEditorRoleChange(member: MemberRow) {
  if (!memberRoleForm.siteId) return
  await submitRoleChange(member, 'editor', {
    siteId: memberRoleForm.siteId,
    locationId: memberRoleForm.locationId || null,
  })
}

async function submitRoleChange(member: MemberRow, role: string, scope?: { siteId: string; locationId: string | null }) {
  roleUpdatingId.value = member.id
  roleUpdateError.value = null
  roleUpdateErrorMemberId.value = null
  try {
    await dashboardApi(`/api/dashboard/organizations/members/${member.id}/role`, {
      method: 'POST',
      body: { role, siteId: scope?.siteId, locationId: scope?.locationId },
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
    cancelRoleEdit()
    await refresh()
  } catch (err: unknown) {
    roleUpdateError.value = err instanceof ApiClientError && typeof err.data.error === 'string'
      ? err.data.error
      : err instanceof Error ? err.message : 'Failed to update member role.'
    roleUpdateErrorMemberId.value = member.id
  } finally {
    roleUpdatingId.value = null
  }
}

async function cancelInvitation(invitationId: string) {
  cancellingInviteId.value = invitationId
  pendingInvitationError.value = null

  try {
    const { error } = await authClient.organization.cancelInvitation({ invitationId })

    if (error) {
      pendingInvitationError.value = error.message ?? 'Failed to cancel invitation.'
      return
    }

    await refresh()
  } catch (err) {
    pendingInvitationError.value = err instanceof Error ? err.message : 'Failed to cancel invitation.'
  } finally {
    cancellingInviteId.value = null
  }
}

async function removeMember(memberId: string) {
  removingMemberId.value = memberId
  memberError.value = null

  try {
    const organizationId = dashboard.organization.value?.id
    if (!organizationId) throw new Error('Organization context is unavailable')
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
      organizationId,
    })
    if (error) throw new Error(error.message || 'Failed to remove member.')
    await refresh()
  } catch (err: unknown) {
    memberError.value = err instanceof Error ? err.message : 'Failed to remove member.'
  } finally {
    removingMemberId.value = null
  }
}

function formatDate(value: string) {
  return formatTimestamp(value, 'en', 'UTC', { dateStyle: 'medium' })
}


</script>

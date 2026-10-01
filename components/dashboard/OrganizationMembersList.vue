<template>
  <!--
    The team as rows, the way Airbnb lists co-hosts: one hairline list, the
    role a pill on the row. Pending invitations are a second group under its
    own heading, not a second card.
  -->
  <div class="space-y-8">
    <section>
      <h2 class="px-1 text-sm font-semibold text-muted">Team</h2>
      <div v-if="pending && !data" class="mt-3 space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-14 rounded-lg" />
      </div>
      <ul v-else-if="members.length">
        <li v-for="member in members" :key="member.id" class="border-b border-default py-6 last:border-b-0">
          <div class="flex items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-3">
              <UAvatar :src="member.image || undefined" :alt="member.name || member.email" icon="i-lucide-user" size="lg" />
              <div class="min-w-0">
                <p class="truncate text-base text-highlighted">{{ member.name || member.email }}</p>
                <p class="truncate text-sm text-muted">{{ member.email }}</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <USelect
                v-if="canEditMemberRole(member)"
                :model-value="member.role"
                :items="roleOptionsFor(member)"
                variant="soft"
                size="sm"
                :ui="{ base: 'rounded-full capitalize' }"
                :aria-label="`Role for ${member.name || member.email}`"
                :loading="roleUpdatingId === member.id"
                @update:model-value="value => onRoleSelected(member, String(value))"
              />
              <UBadge v-else :label="member.role" color="neutral" variant="soft" size="lg" class="rounded-full capitalize" />
              <UButton
                v-if="member.role !== 'owner'"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="removingMemberId === member.id"
                :aria-label="`Remove ${member.name || member.email}`"
                @click="removeMember(member.id)"
              />
            </div>
          </div>
          <UAlert
            v-if="roleUpdateError && roleUpdateErrorMemberId === member.id"
            class="mt-3"
            color="error"
            variant="soft"
            :description="roleUpdateError"
          />
        </li>
      </ul>
      <p v-else class="mt-3 px-1 text-sm text-muted">No members found for this organization.</p>
      <UAlert v-if="memberError" class="mt-4" color="error" variant="soft" icon="i-lucide-circle-alert" :description="memberError" />
    </section>

    <section>
      <h2 class="px-1 text-sm font-semibold text-muted">Pending</h2>
      <div v-if="pending && !data" class="mt-3 space-y-3">
        <USkeleton v-for="i in 2" :key="i" class="h-14 rounded-lg" />
      </div>
      <ul v-else-if="invitations.length">
        <li v-for="invitation in invitations" :key="invitation.id" class="flex items-center justify-between gap-4 border-b border-default py-6 last:border-b-0">
          <div class="min-w-0">
            <p class="truncate text-base text-highlighted">{{ invitation.email }}</p>
            <p class="truncate text-sm text-muted">
              <template v-if="invitation.inviterName">Invited by {{ invitation.inviterName }} · </template>Expires {{ formatDate(invitation.expiresAt) }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge v-if="invitation.role" :label="invitation.role" color="neutral" variant="soft" size="lg" class="rounded-full capitalize" />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="cancellingInviteId === invitation.id"
              :aria-label="`Cancel invitation for ${invitation.email}`"
              @click="cancelInvitation(invitation.id)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="mt-3 px-1 text-sm text-muted">No pending invitations.</p>
      <UAlert v-if="pendingInvitationError" class="mt-4" color="error" variant="soft" icon="i-lucide-circle-alert" :description="pendingInvitationError" />
    </section>
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
const dashboard = useDashboardOrganization()
const membersKey = computed(() => organizationMembersKey(String(route.params.orgSlug ?? '')))

const { data, pending, refresh } = await useAsyncData(
  membersKey,
  () => dashboardApi<{ members: MemberRow[]; invitations: InvitationRow[] }>(
    '/api/dashboard/members',
    { validate: isMembersResponse },
  ),
  // Nuxt blocks navigation on useAsyncData by default; the client does not
  // need to wait for this to paint the route, and `pending` already drives a
  // loading state here.
  { lazy: true },
)

const members = computed(() => data.value?.members ?? [])
const invitations = computed(() => data.value?.invitations ?? [])

const session = authClient.useSession()
const currentUser = computed(() => session.value.data?.user ?? null)
const currentUserRole = computed(() => {
  const match = members.value.find(member => member.userId === currentUser.value?.id)
  return match?.role ?? null
})
const isOwner = computed(() => currentUserRole.value === 'owner')

const BASE_ROLE_OPTIONS = [
  { label: 'Admin', value: 'admin' },
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

const roleUpdatingId = ref<string | null>(null)
const roleUpdateError = ref<string | null>(null)
const roleUpdateErrorMemberId = ref<string | null>(null)

function onRoleSelected(member: MemberRow, role: string) {
  roleUpdateError.value = null
  roleUpdateErrorMemberId.value = null
  if (role === member.role) return
  void submitRoleChange(member, role)
}

async function submitRoleChange(member: MemberRow, role: string) {
  roleUpdatingId.value = member.id
  roleUpdateError.value = null
  roleUpdateErrorMemberId.value = null
  try {
    await dashboardApi(`/api/dashboard/organizations/members/${member.id}/role`, {
      method: 'POST',
      body: { role },
      validate: (value): value is { success: true } => isRecord(value) && value.success === true,
    })
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

<template>
  <UDashboardPanel id="org-settings-members">
    <template #header>
      <UDashboardNavbar title="Members">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Team</h2>
                <p class="mt-1 text-sm text-muted">People with access to this organization.</p>
              </div>
              <UBadge :label="`${members.length} member${members.length === 1 ? '' : 's'}`" color="neutral" variant="soft" />
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
                  <UBadge :label="member.role" color="neutral" variant="soft" class="capitalize" />
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

              <UAlert
                v-if="pendingRemoval && pendingRemoval.memberId === member.id"
                color="warning"
                variant="soft"
                icon="i-lucide-triangle-alert"
              >
                <template #title>
                  Removing {{ member.name || member.email }} will also clear these WhatsApp notification assignments
                </template>
                <template #description>
                  <ul class="mt-1 list-disc pl-4 text-sm">
                    <li v-for="(assignment, index) in pendingRemoval.assignments" :key="index">
                      {{ assignment.locationName ? `${assignment.siteName} · ${assignment.locationName}` : `${assignment.siteName} (site-wide)` }}
                    </li>
                  </ul>
                  <div class="mt-3 flex items-center gap-2">
                    <UButton
                      label="Clear assignments and remove"
                      color="error"
                      size="xs"
                      :loading="removingMemberId === member.id"
                      @click="confirmRemoveMember(member.id)"
                    />
                    <UButton label="Cancel" color="neutral" variant="ghost" size="xs" @click="pendingRemoval = null" />
                  </div>
                </template>
              </UAlert>
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
                    {{ invitation.isPhoneInvite ? `WhatsApp · ${invitation.phoneDisplay}` : invitation.email }}
                  </p>
                  <p class="truncate text-sm text-muted">
                    Invited by {{ invitation.inviterName || 'team member' }} · Expires {{ formatDate(invitation.expiresAt) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge :label="invitation.role || 'member'" color="neutral" variant="soft" class="capitalize" />
                  <UBadge
                    v-if="invitation.isPhoneInvite"
                    :label="deliveryLabel(invitation.deliveryStatus)"
                    :color="deliveryColor(invitation.deliveryStatus)"
                    variant="soft"
                  />
                  <UButton
                    v-if="!invitation.isPhoneInvite"
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

              <div v-if="invitation.isPhoneInvite" class="flex flex-wrap items-center gap-2">
                <UButton
                  label="Retry"
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  :loading="invitationActionId === invitation.id && invitationAction === 'retry'"
                  @click="retryInvitation(invitation.id)"
                />
                <UButton
                  label="Replace number"
                  icon="i-lucide-phone"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  @click="toggleReplaceForm(invitation.id)"
                />
                <UButton
                  label="Clear"
                  icon="i-lucide-x"
                  color="error"
                  variant="soft"
                  size="xs"
                  :loading="invitationActionId === invitation.id && invitationAction === 'clear'"
                  @click="clearInvitation(invitation.id)"
                />
              </div>

              <div v-if="replaceFormInvitationId === invitation.id" class="flex items-center gap-2">
                <UInput v-model="replacePhone" placeholder="+66 81 234 5678" size="xs" class="max-w-56" />
                <UButton
                  label="Save"
                  color="primary"
                  size="xs"
                  :loading="invitationActionId === invitation.id && invitationAction === 'replace'"
                  @click="replaceInvitation(invitation.id)"
                />
                <UButton label="Cancel" color="neutral" variant="ghost" size="xs" @click="replaceFormInvitationId = null" />
              </div>

              <UAlert
                v-if="invitationActionError && invitationActionErrorId === invitation.id"
                color="error"
                variant="soft"
                :description="invitationActionError"
              />
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

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Invite a team member</h2>
          </template>

          <UForm :state="inviteForm" class="flex flex-col gap-4 sm:flex-row sm:items-end" @submit="sendInvite">
            <UFormField label="Email address" class="flex-1">
              <UInput
                v-model="inviteForm.email"
                type="email"
                placeholder="teammate@example.com"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField label="Role" class="w-36">
              <USelect
                v-model="inviteForm.role"
                :items="roleOptions"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              icon="i-lucide-send"
              :loading="inviting"
              label="Send invite"
            />
          </UForm>

          <UAlert
            v-if="inviteError"
            class="mt-4"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="inviteError"
          />
          <UAlert
            v-if="inviteSuccess"
            class="mt-4"
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            description="Invitation sent."
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

definePageMeta({ layout: 'dashboard' })

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
  isPhoneInvite: boolean
  phoneDisplay: string | null
  deliveryStatus: string | null
  deliveryError: string | null
}

interface PhoneAssignment {
  kind: 'location' | 'site'
  organizationId: string
  siteId: string
  siteName: string | null
  locationId: string | null
  locationName: string | null
}

const route = useRoute()

const { data, pending, refresh } = await useAsyncData(
  'dashboard-org-members',
  async () => {
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) return null
      const [{ cloudflareEnv }, { getAuthSession }, { getOrganizationMembersData }, { queryFirst }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/auth'),
        import('~/server/utils/dashboard-members'),
        import('~/server/db'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const session = await getAuthSession(requestEvent, env)
      if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
      const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      if (!orgSlug) throw createError({ statusCode: 400, statusMessage: 'Organization slug is required' })
      const org = await queryFirst<{ id: string }>(db, `
        SELECT o.id FROM organization o
        JOIN member m ON o.id = m.organizationId
        WHERE m.userId = ? AND o.slug = ? LIMIT 1
      `, [session.user.id, orgSlug])
      if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
      return await getOrganizationMembersData(db, org.id)
    }
    return await $fetch<{ members: MemberRow[]; invitations: InvitationRow[] }>('/api/dashboard/members')
  },
)

const members = computed(() => data.value?.members ?? [])
const invitations = computed(() => data.value?.invitations ?? [])

const roleOptions = [
  { label: 'Member', value: 'member' },
  { label: 'Admin', value: 'admin' },
]

const inviteForm = reactive({ email: '', role: 'member' })
const inviting = ref(false)
const inviteError = ref<string | null>(null)
const inviteSuccess = ref(false)
const inviteSuccessTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const removingMemberId = ref<string | null>(null)
const cancellingInviteId = ref<string | null>(null)
const memberError = ref<string | null>(null)
const pendingInvitationError = ref<string | null>(null)
const pendingRemoval = ref<{ memberId: string; assignments: PhoneAssignment[] } | null>(null)

const invitationActionId = ref<string | null>(null)
const invitationAction = ref<'retry' | 'replace' | 'clear' | null>(null)
const invitationActionError = ref<string | null>(null)
const invitationActionErrorId = ref<string | null>(null)
const replaceFormInvitationId = ref<string | null>(null)
const replacePhone = ref('')

function deliveryLabel(status: string | null): string {
  if (status === 'sent') return 'Sent'
  if (status === 'failed') return 'Failed'
  return 'Sending…'
}

function deliveryColor(status: string | null): 'success' | 'error' | 'neutral' {
  if (status === 'sent') return 'success'
  if (status === 'failed') return 'error'
  return 'neutral'
}

function toggleReplaceForm(invitationId: string) {
  replaceFormInvitationId.value = replaceFormInvitationId.value === invitationId ? null : invitationId
  replacePhone.value = ''
  invitationActionError.value = null
}

async function retryInvitation(invitationId: string) {
  invitationActionId.value = invitationId
  invitationAction.value = 'retry'
  invitationActionError.value = null
  invitationActionErrorId.value = null
  try {
    await $fetch(`/api/dashboard/invitations/${invitationId}/retry`, { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    invitationActionError.value = errorData?.error ?? 'Failed to resend the invitation.'
    invitationActionErrorId.value = invitationId
  } finally {
    invitationActionId.value = null
    invitationAction.value = null
  }
}

async function replaceInvitation(invitationId: string) {
  if (!replacePhone.value.trim()) return
  invitationActionId.value = invitationId
  invitationAction.value = 'replace'
  invitationActionError.value = null
  invitationActionErrorId.value = null
  try {
    await $fetch(`/api/dashboard/invitations/${invitationId}/replace`, {
      method: 'POST',
      body: { phone: replacePhone.value.trim() },
    })
    replaceFormInvitationId.value = null
    replacePhone.value = ''
    await refresh()
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    invitationActionError.value = errorData?.error ?? 'Failed to replace the phone number.'
    invitationActionErrorId.value = invitationId
  } finally {
    invitationActionId.value = null
    invitationAction.value = null
  }
}

async function clearInvitation(invitationId: string) {
  invitationActionId.value = invitationId
  invitationAction.value = 'clear'
  invitationActionError.value = null
  invitationActionErrorId.value = null
  try {
    await $fetch(`/api/dashboard/invitations/${invitationId}/clear`, { method: 'POST' })
    await refresh()
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    invitationActionError.value = errorData?.error ?? 'Failed to clear this invitation.'
    invitationActionErrorId.value = invitationId
  } finally {
    invitationActionId.value = null
    invitationAction.value = null
  }
}

const { data: session } = await authClient.useSession(useFetch)
const activeOrgId = computed(() => session.value?.session?.activeOrganizationId ?? null)

async function sendInvite() {
  if (!activeOrgId.value) {
    inviteError.value = 'No active organization selected. Reload the page and try again.'
    return
  }
  inviting.value = true
  inviteError.value = null
  inviteSuccess.value = false

  try {
    const { error } = await authClient.organization.inviteMember({
      email: inviteForm.email,
      role: inviteForm.role as 'member' | 'admin',
      organizationId: activeOrgId.value,
    })

    if (error) {
      inviteError.value = error.message ?? 'Failed to send invite.'
      return
    }

    inviteForm.email = ''
    inviteForm.role = 'member'
    inviteSuccess.value = true
    if (inviteSuccessTimeout.value !== null) {
      clearTimeout(inviteSuccessTimeout.value)
    }
    inviteSuccessTimeout.value = setTimeout(() => { inviteSuccess.value = false }, 4000)
    await refresh()
  } catch (err) {
    inviteError.value = err instanceof Error ? err.message : 'Failed to send invite.'
  } finally {
    inviting.value = false
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

// Routes through a dedicated server endpoint rather than calling
// authClient.organization.removeMember directly — Better Auth's org-plugin
// after-hook can't block/veto, so this server route is the only place that
// can check for active WhatsApp notification assignments before removing a
// location_manager and require a deliberate confirm-and-clear step (issue
// #293 Section H).
async function submitRemoveMember(memberId: string, options?: { confirmed?: boolean }) {
  removingMemberId.value = memberId
  memberError.value = null

  try {
    await $fetch(`/api/dashboard/organizations/members/${memberId}/remove`, {
      method: 'POST',
      body: options?.confirmed ? { action: 'clear', confirmed: true } : {},
    })
    pendingRemoval.value = null
    await refresh()
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err
      ? (err as Record<string, { error?: string; requiresConfirmation?: boolean; assignments?: PhoneAssignment[] }>).data
      : null
    if (errorData?.requiresConfirmation && errorData.assignments) {
      pendingRemoval.value = { memberId, assignments: errorData.assignments }
    } else {
      pendingRemoval.value = null
      memberError.value = errorData?.error ?? 'Failed to remove member.'
    }
  } finally {
    removingMemberId.value = null
  }
}

async function removeMember(memberId: string) {
  await submitRemoveMember(memberId)
}

async function confirmRemoveMember(memberId: string) {
  await submitRemoveMember(memberId, { confirmed: true })
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

onBeforeUnmount(() => {
  if (inviteSuccessTimeout.value !== null) {
    clearTimeout(inviteSuccessTimeout.value)
  }
})

useSeoMeta({ title: 'Members | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<template>
  <UDashboardPanel id="admin-members">
    <template #header>
      <UDashboardNavbar title="Members">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">

        <!-- KrabiClaw Team -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">KrabiClaw Team</h2>
                <p class="mt-0.5 text-sm text-muted">Platform admins with full access.</p>
              </div>
              <UBadge :label="`${team.length}`" color="neutral" variant="soft" />
            </div>
          </template>

          <div v-if="membersLoading" class="space-y-3">
            <USkeleton v-for="i in 2" :key="i" class="h-14 rounded-lg" />
          </div>
          <div v-else-if="team.length" class="divide-y divide-default">
            <div v-for="member in team" :key="member.id" class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div class="flex items-center gap-3 min-w-0">
                <UAvatar :src="member.image || undefined" :alt="member.name || member.email" icon="i-lucide-user" />
                <div class="min-w-0">
                  <p class="truncate font-medium text-highlighted">{{ member.name || member.email }}</p>
                  <p class="truncate text-sm text-muted">{{ member.email }}</p>
                </div>
              </div>
              <UBadge label="admin" color="primary" variant="soft" />
            </div>
          </div>

          <template #footer>
            <div class="flex gap-2">
              <UInput v-model="teamInviteEmail" placeholder="name@email.com" class="flex-1" @keyup.enter="inviteTeamMember" />
              <UInput v-model="teamInviteName" placeholder="Name (optional)" class="w-40" />
              <UButton :loading="invitingTeam" @click="inviteTeamMember">Add to team</UButton>
            </div>
            <p v-if="teamInviteResult" class="mt-2 text-sm" :class="teamInviteResult.error ? 'text-error' : 'text-success'">
              {{ teamInviteResult.message }}
            </p>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Add organization member</h2>
              <p class="mt-0.5 text-sm text-muted">Add an existing user directly without sending an invitation.</p>
            </div>
          </template>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="Organization ID">
              <UInput v-model="organizationMemberForm.organizationId" class="w-full" />
            </UFormField>
            <UFormField label="User email">
              <UInput v-model="organizationMemberForm.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Role">
              <USelect v-model="organizationMemberForm.role" :items="organizationRoleOptions" class="w-full" />
            </UFormField>
          </div>

          <template #footer>
            <UButton :loading="addingOrganizationMember" @click="addOrganizationMember">Add member</UButton>
            <p v-if="organizationMemberResult" class="mt-2 text-sm" :class="organizationMemberResult.error ? 'text-error' : 'text-success'">
              {{ organizationMemberResult.message }}
            </p>
          </template>
        </UCard>

      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Members | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface TeamMember { id: string; name: string | null; email: string; image: string | null; role: string; createdAt: string }

const team = ref<TeamMember[]>([])
const membersLoading = ref(false)
const teamInviteEmail = ref('')
const teamInviteName = ref('')
const invitingTeam = ref(false)
const teamInviteResult = ref<{ error?: boolean; message: string } | null>(null)
const organizationMemberForm = reactive({ organizationId: '', email: '', role: 'member' })
const organizationRoleOptions = [
  { label: 'Owner', value: 'owner' },
  { label: 'Admin', value: 'admin' },
  { label: 'Member', value: 'member' },
  { label: 'Editor', value: 'editor' },
]
const addingOrganizationMember = ref(false)
const organizationMemberResult = ref<{ error?: boolean; message: string } | null>(null)

const isMembersResponse = (value: unknown): value is { team: TeamMember[] } =>
  isRecord(value)
  && Array.isArray(value.team)
  && value.team.every(member =>
    isRecord(member) && typeof member.id === 'string' && typeof member.email === 'string',
  )
const isTeamInviteResponse = (value: unknown): value is { action: string; email: string } =>
  isRecord(value) && typeof value.action === 'string' && typeof value.email === 'string'
const isOrganizationMemberResponse = (value: unknown): value is { success: true; email: string } =>
  isRecord(value) && value.success === true && typeof value.email === 'string'

async function loadMembers() {
  membersLoading.value = true
  try {
    const res = await applicationFetch<{ team: TeamMember[] }>('/api/admin/members', { validate: isMembersResponse })
    team.value = res.team
  } catch {
    toast.add({ title: 'Failed to load members', color: 'error' })
  } finally {
    membersLoading.value = false
  }
}

async function inviteTeamMember() {
  const email = teamInviteEmail.value.trim()
  if (!email) return
  invitingTeam.value = true
  teamInviteResult.value = null
  try {
    const res = await applicationFetch<{ action: string; email: string }>('/api/admin/invite/team', {
      method: 'POST',
      body: { email, name: teamInviteName.value.trim() || undefined },
      validate: isTeamInviteResponse,
    })
    const verb = res.action === 'promoted' ? 'promoted to admin' : 'created as admin'
    teamInviteResult.value = { message: `${res.email} ${verb}` }
    teamInviteEmail.value = ''
    teamInviteName.value = ''
    await loadMembers()
  } catch (err: unknown) {
    teamInviteResult.value = { error: true, message: getErrorMessage(err, 'Failed to add team member') }
  } finally {
    invitingTeam.value = false
  }
}

async function addOrganizationMember() {
  addingOrganizationMember.value = true
  organizationMemberResult.value = null
  try {
    const result = await applicationFetch<{ success: true; email: string }>('/api/admin/organization-members', {
      method: 'POST',
      body: organizationMemberForm,
      validate: isOrganizationMemberResponse,
    })
    organizationMemberResult.value = { message: `${result.email} added to the organization` }
    organizationMemberForm.email = ''
  } catch (error) {
    organizationMemberResult.value = { error: true, message: getErrorMessage(error, 'Failed to add organization member') }
  } finally {
    addingOrganizationMember.value = false
  }
}

onMounted(loadMembers)
</script>

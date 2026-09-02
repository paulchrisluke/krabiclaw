<template>
  <UDashboardPanel id="admin-members">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Members">
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

const isMembersResponse = (value: unknown): value is { team: TeamMember[] } =>
  isRecord(value)
  && Array.isArray(value.team)
  && value.team.every(member =>
    isRecord(member) && typeof member.id === 'string' && typeof member.email === 'string',
  )
const isTeamInviteResponse = (value: unknown): value is { action: string; email: string } =>
  isRecord(value) && typeof value.action === 'string' && typeof value.email === 'string'

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

onMounted(loadMembers)
</script>

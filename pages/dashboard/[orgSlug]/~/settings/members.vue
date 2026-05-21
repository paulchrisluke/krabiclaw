<template>
  <UPage>
    <UPageHeader
      title="Members"
      description="Manage who can access this restaurant workspace."
    />

    <UPageBody>
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
              class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
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
              <UBadge :label="member.role" color="neutral" variant="soft" class="capitalize" />
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-users"
            description="No members found for this organization."
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
              class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">{{ invitation.email }}</p>
                <p class="truncate text-sm text-muted">
                  Invited by {{ invitation.inviterName || 'team member' }} · Expires {{ formatDate(invitation.expiresAt) }}
                </p>
              </div>
              <UBadge :label="invitation.role || 'member'" color="neutral" variant="soft" class="capitalize" />
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-mail"
            description="No pending invitations."
          />
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
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
}

const { data, pending } = await useFetch<{
  members: MemberRow[]
  invitations: InvitationRow[]
}>('/api/dashboard/members')

const members = computed(() => data.value?.members ?? [])
const invitations = computed(() => data.value?.invitations ?? [])

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

useSeoMeta({ title: 'Members | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

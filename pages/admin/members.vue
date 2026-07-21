<template>
  <UDashboardPanel id="admin-members">
    <template #header>
      <UDashboardNavbar title="Members">
        <template #leading>
          <UDashboardSidebarCollapse />
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

        <!-- Invite Client -->
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Invite Client</h2>
              <p class="mt-0.5 text-sm text-muted">
                {{ inviteMode === 'new'
                  ? 'Creates an org and generates an invite link to send via WhatsApp.'
                  : 'Attaches an owner invitation to an org that already exists (e.g. one provisioned by client:import).' }}
              </p>
            </div>
          </template>

          <div class="space-y-3">
            <UButtonGroup class="w-full">
              <UButton
                class="flex-1 justify-center"
                :color="inviteMode === 'new' ? 'primary' : 'neutral'"
                :variant="inviteMode === 'new' ? 'solid' : 'soft'"
                @click="setInviteMode('new')"
              >
                New client
              </UButton>
              <UButton
                class="flex-1 justify-center"
                :color="inviteMode === 'existing' ? 'primary' : 'neutral'"
                :variant="inviteMode === 'existing' ? 'solid' : 'soft'"
                @click="setInviteMode('existing')"
              >
                Existing organization
              </UButton>
            </UButtonGroup>

            <UFormField v-if="inviteMode === 'new'" label="Business name">
              <UInput v-model="clientRestaurantName" placeholder="Kikuzuki Krabi" class="w-full" />
            </UFormField>

            <UFormField v-else label="Organization">
              <UInputMenu
                v-model="selectedOrg"
                v-model:search-term="orgSearchTerm"
                :items="orgSearchResults"
                :loading="orgSearchLoading"
                ignore-filter
                by="id"
                label-key="name"
                placeholder="Search by slug or name..."
                class="w-full"
              >
                <template #item-label="{ item }">
                  <div class="flex items-center justify-between gap-2 w-full">
                    <span class="truncate">{{ item.name }}<span class="text-muted"> · {{ item.slug || 'no slug' }}</span></span>
                    <UBadge v-if="item.hasOwner" label="has owner" color="warning" variant="soft" size="sm" />
                    <UBadge v-else-if="item.hasPendingInvitation" label="invite pending" color="warning" variant="soft" size="sm" />
                  </div>
                </template>
              </UInputMenu>
              <p v-if="selectedOrg?.hasOwner" class="mt-1 text-xs text-warning">
                This organization already has an owner — sending an invite will fail.
              </p>
              <p v-else-if="selectedOrg?.hasPendingInvitation" class="mt-1 text-xs text-warning">
                This organization already has a pending owner invitation — sending another will fail.
              </p>
            </UFormField>

            <UFormField label="Owner email">
              <UInput v-model="clientEmail" type="email" placeholder="owner@business.com" class="w-full" @keyup.enter="inviteClient" />
            </UFormField>
            <UButton
              :loading="invitingClient"
              :disabled="inviteMode === 'existing' && (!selectedOrg || selectedOrg.hasOwner || selectedOrg.hasPendingInvitation)"
              @click="inviteClient"
            >
              Generate invite link
            </UButton>
          </div>

          <div v-if="clientInviteResult" class="mt-4">
            <template v-if="clientInviteResult.inviteUrl">
              <p class="text-sm font-medium text-highlighted mb-2">Invite link for {{ clientInviteResult.restaurantName }}</p>
              <div class="flex gap-2">
                <UInput :model-value="clientInviteResult.inviteUrl" readonly class="flex-1 font-mono text-xs" />
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="copyInviteLink(clientInviteResult.inviteUrl)"
                >
                  Copy
                </UButton>
                <UButton
                  color="success"
                  variant="soft"
                  icon="i-lucide-message-circle"
                  :href="`https://wa.me/?text=${encodeURIComponent('Hi! Here is your link to set up your site on KrabiClaw: ' + clientInviteResult.inviteUrl)}`"
                  target="_blank"
                >
                  WhatsApp
                </UButton>
              </div>
            </template>
            <p v-else class="text-sm text-error">{{ clientInviteResult.error }}</p>
          </div>
        </UCard>

        <!-- Pending Invitations -->
        <UCard v-if="pendingInvitations.length">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-highlighted">Pending Invitations</h2>
              <UBadge :label="`${pendingInvitations.length}`" color="warning" variant="soft" />
            </div>
          </template>
          <div class="divide-y divide-default">
            <div v-for="inv in pendingInvitations" :key="inv.id" class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">{{ inv.email }}</p>
                <p class="truncate text-sm text-muted">
                  {{ inv.orgName || 'Platform invite' }}
                  · Expires {{ formatDate(inv.expiresAt) }}
                </p>
              </div>
              <UBadge :label="inv.role || 'member'" color="neutral" variant="soft" class="capitalize" />
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Members | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface TeamMember { id: string; name: string | null; email: string; image: string | null; role: string; createdAt: string }
interface PendingInvitation { id: string; email: string; role: string | null; expiresAt: string; orgName: string | null; orgSlug: string | null }

const team = ref<TeamMember[]>([])
const pendingInvitations = ref<PendingInvitation[]>([])
const membersLoading = ref(false)

const teamInviteEmail = ref('')
const teamInviteName = ref('')
const invitingTeam = ref(false)
const teamInviteResult = ref<{ error?: boolean; message: string } | null>(null)

const clientEmail = ref('')
const clientRestaurantName = ref('')
const invitingClient = ref(false)
const clientInviteResult = ref<{ inviteUrl?: string; restaurantName?: string; error?: string } | null>(null)

// ── Invite Client: new-org vs existing-org mode ──────────────────────────────
interface OrgSearchResult { id: string; name: string; slug: string | null; hasOwner: boolean; hasPendingInvitation: boolean }

const inviteMode = ref<'new' | 'existing'>('new')
const orgSearchTerm = ref('')
const orgSearchResults = ref<OrgSearchResult[]>([])
const orgSearchLoading = ref(false)
const selectedOrg = ref<OrgSearchResult | undefined>(undefined)
let orgSearchDebounce: ReturnType<typeof setTimeout> | undefined

async function runOrgSearch(term: string) {
  orgSearchLoading.value = true
  try {
    const res = await $fetch<{ organizations: OrgSearchResult[] }>('/api/admin/organizations', {
      query: { q: term },
    })
    if (term !== orgSearchTerm.value) return
    orgSearchResults.value = res.organizations
  } catch {
    if (term !== orgSearchTerm.value) return
    toast.add({ title: 'Failed to search organizations', color: 'error' })
  } finally {
    if (term === orgSearchTerm.value) orgSearchLoading.value = false
  }
}

watch(orgSearchTerm, (term) => {
  if (orgSearchDebounce) clearTimeout(orgSearchDebounce)
  orgSearchDebounce = setTimeout(() => runOrgSearch(term), 250)
})

function setInviteMode(mode: 'new' | 'existing') {
  inviteMode.value = mode
  clientInviteResult.value = null
  if (mode === 'existing' && orgSearchResults.value.length === 0 && !orgSearchLoading.value) {
    runOrgSearch(orgSearchTerm.value)
  }
}

async function loadMembers() {
  membersLoading.value = true
  try {
    const res = await $fetch<{ team: TeamMember[]; pendingInvitations: PendingInvitation[] }>('/api/admin/members')
    team.value = res.team
    pendingInvitations.value = res.pendingInvitations
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
    const res = await $fetch<{ action: string; email: string }>('/api/admin/invite/team', {
      method: 'POST',
      body: { email, name: teamInviteName.value.trim() || undefined },
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

async function inviteClient() {
  const email = clientEmail.value.trim()

  if (inviteMode.value === 'existing') {
    if (!email || !selectedOrg.value) return
    invitingClient.value = true
    clientInviteResult.value = null
    try {
      const res = await $fetch<{ inviteUrl: string; restaurantName: string }>('/api/admin/invite/client', {
        method: 'POST',
        body: { email, orgId: selectedOrg.value.id },
      })
      clientInviteResult.value = res
      clientEmail.value = ''
      // Existing-org mode only: reset the org picker's search state. The watch on
      // orgSearchTerm will trigger the debounced search automatically.
      selectedOrg.value = undefined
      orgSearchTerm.value = ''
    } catch (err: unknown) {
      clientInviteResult.value = { error: getErrorMessage(err, 'Failed to create invitation') }
    } finally {
      invitingClient.value = false
    }
    return
  }

  const name = clientRestaurantName.value.trim()
  if (!email || !name) return
  invitingClient.value = true
  clientInviteResult.value = null
  try {
    const res = await $fetch<{ inviteUrl: string; restaurantName: string }>('/api/admin/invite/client', {
      method: 'POST',
      body: { email, restaurantName: name },
    })
    clientInviteResult.value = res
    clientEmail.value = ''
    clientRestaurantName.value = ''
  } catch (err: unknown) {
    clientInviteResult.value = { error: getErrorMessage(err, 'Failed to create invitation') }
  } finally {
    invitingClient.value = false
  }
}

async function copyInviteLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Invite link copied', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to copy invite link', color: 'error' })
  }
}

onMounted(loadMembers)
</script>

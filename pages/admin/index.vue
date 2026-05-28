<template>
  <UPage>
    <UPageBody>

      <!-- ── QUEUE ── -->
      <div v-if="activeTab === 'queue'" class="space-y-4">
        <div class="flex justify-end">
          <UButton color="neutral" variant="ghost" size="xs" :loading="queueLoading" @click="loadQueue">
            <UIcon name="i-heroicons-arrow-path" class="size-4" />
          </UButton>
        </div>

        <UCard v-if="queueLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="purchases.length === 0">
          <div class="text-center">
            <UIcon name="i-heroicons-check-badge" class="mx-auto size-10 text-success mb-3" />
            <p class="font-semibold text-highlighted">All caught up</p>
            <p class="text-sm text-muted mt-1">No pending service add-ons.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="purchase in purchases"
            :key="purchase.id"
            class="flex items-center justify-between gap-4 px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="addonColor(purchase.addon_type)">
                <UIcon :name="addonIcon(purchase.addon_type)" class="size-4" />
              </div>
              <div class="min-w-0">
                <p class="font-semibold text-default">{{ addonLabel(purchase.addon_type) }}</p>
                <p class="text-sm text-muted truncate">{{ purchase.org_name }} · {{ formatDate(purchase.created_at) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="purchase.org_slug"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-arrow-top-right-on-square"
                :to="`/dashboard/${purchase.org_slug}`"
                target="_blank"
              >
                View
              </UButton>
              <UButton
                size="xs"
                color="success"
                variant="soft"
                icon="i-heroicons-check"
                :loading="fulfillingId === purchase.id"
                @click="markDone(purchase.id)"
              >
                Mark done
              </UButton>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UCheckbox v-model="showAllPurchases" label="Show fulfilled" @update:model-value="loadQueue" />
        </div>
      </div>

      <!-- ── MEMBERS ── -->
      <div v-if="activeTab === 'members'" class="space-y-6">

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

        <!-- Invite Restaurant Client -->
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Invite Restaurant Client</h2>
              <p class="mt-0.5 text-sm text-muted">Creates an org and generates an invite link to send via WhatsApp.</p>
            </div>
          </template>

          <div class="space-y-3">
            <UFormField label="Restaurant name">
              <UInput v-model="clientRestaurantName" placeholder="Kikuzuki Krabi" class="w-full" />
            </UFormField>
            <UFormField label="Owner email">
              <UInput v-model="clientEmail" type="email" placeholder="owner@restaurant.com" class="w-full" @keyup.enter="inviteClient" />
            </UFormField>
            <UButton :loading="invitingClient" @click="inviteClient">Generate invite link</UButton>
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
                  :href="`https://wa.me/?text=${encodeURIComponent('Hi! Here is your link to set up your restaurant on KrabiClaw: ' + clientInviteResult.inviteUrl)}`"
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

      <!-- ── CLIENTS ── -->
      <div v-if="activeTab === 'clients'" class="space-y-4">
        <div class="flex justify-end">
          <UButton color="neutral" variant="ghost" size="xs" :loading="clientsLoading" @click="loadClients">
            <UIcon name="i-heroicons-arrow-path" class="size-4" />
          </UButton>
        </div>

        <UCard v-if="clientsLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="clients.length === 0">
          <div class="text-center">
            <UIcon name="i-heroicons-building-storefront" class="mx-auto size-10 text-muted mb-3" />
            <p class="font-semibold text-highlighted">No managed clients yet</p>
            <p class="text-sm text-muted mt-1">Clients on Growth, Managed, or SEO Accelerator will appear here.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="client in clients"
            :key="client.org_id"
            class="flex items-center justify-between gap-4 px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-building-storefront" class="size-4" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-semibold text-default truncate">{{ client.brand_name || client.org_name }}</p>
                  <UBadge :label="planLabel(client.plan)" :color="planColor(client.plan)" variant="soft" size="xs" />
                </div>
                <p class="text-sm text-muted">
                  <span v-if="client.subdomain">{{ client.subdomain }}.krabiclaw.com</span>
                  <span v-else class="italic opacity-50">No subdomain</span>
                  <template v-if="client.source_locale"> · {{ client.source_locale }}</template>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="client.org_slug"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-language"
                :to="`/dashboard/${client.org_slug}/translations`"
                target="_blank"
              >
                Translations
              </UButton>
              <UButton
                v-if="client.site_id"
                size="xs"
                color="success"
                variant="soft"
                icon="i-heroicons-paper-airplane"
                @click="openHandoff(client)"
              >
                Send Handoff
              </UButton>
              <UButton
                v-if="client.org_slug"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-heroicons-arrow-top-right-on-square"
                :to="`/dashboard/${client.org_slug}`"
                target="_blank"
              >
                Workspace
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ── ANALYTICS ── -->
      <div v-if="activeTab === 'analytics'" class="space-y-6">
        <div v-if="analyticsLoading" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <USkeleton v-for="i in 6" :key="i" class="h-24 rounded-xl" />
        </div>
        <div v-else>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <UCard v-for="stat in analyticsStats" :key="stat.label">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ stat.label }}</p>
              <p class="mt-1 text-2xl font-bold text-highlighted">{{ stat.value }}</p>
            </UCard>
          </div>

          <h3 class="text-sm font-semibold text-default mb-3">Recent sites</h3>
          <div class="divide-y divide-default rounded-xl border border-default overflow-hidden">
            <div v-if="!analytics?.recentSites?.length" class="px-5 py-4 text-sm text-muted">No sites yet.</div>
            <div
              v-for="site in analytics?.recentSites"
              :key="site.id"
              class="flex items-center justify-between px-5 py-3"
            >
              <div>
                <p class="font-medium text-default">{{ site.brand_name || site.subdomain }}</p>
                <p class="text-xs text-muted">{{ site.subdomain }}.krabiclaw.com</p>
              </div>
              <p class="text-xs text-muted">{{ formatDate(site.created_at) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── DOMAINS ── -->
      <div v-if="activeTab === 'domains'" class="space-y-4">
        <div class="flex flex-col sm:flex-row gap-2">
          <UInput v-model="domainSearch" placeholder="Search domains" icon="i-heroicons-magnifying-glass" class="flex-1" />
          <UButton variant="soft" color="neutral" :loading="domainsLoading" @click="loadDomains">Refresh</UButton>
        </div>

        <div class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div v-if="domainsLoading" class="px-5 py-4 text-sm text-muted">Loading…</div>
          <div v-else-if="domains.length === 0" class="px-5 py-4 text-sm text-muted">No custom domains found.</div>
          <div v-for="domain in domains" :key="domain.id" class="px-5 py-4">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium text-default">{{ domain.domain }}</p>
                  <UBadge :color="domain.status === 'active' ? 'success' : domain.status === 'failed' || domain.status === 'blocked' ? 'error' : 'warning'" variant="soft">{{ domain.status }}</UBadge>
                  <UBadge v-if="domain.role === 'canonical'" color="primary" variant="soft">Primary</UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">{{ domain.site_name }} · {{ domain.organization_name }}</p>
                <p class="mt-0.5 text-xs text-muted">{{ domain.cloudflare_hostname_id || 'pending CF ID' }}</p>
                <p v-if="domain.error_message" class="mt-0.5 text-xs text-error">{{ domain.error_message }}</p>
              </div>
              <UButton size="sm" variant="soft" color="neutral" icon="i-heroicons-arrow-path" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Sync</UButton>
            </div>
          </div>
        </div>

        <div v-if="domainEvents.length" class="space-y-2">
          <h3 class="text-sm font-semibold text-default">Recent domain events</h3>
          <p v-for="ev in domainEvents" :key="ev.id" class="rounded-lg bg-elevated px-4 py-2 text-xs text-muted">
            {{ formatDate(ev.created_at) }} · {{ ev.domain || '—' }} · {{ ev.event_type }} · {{ ev.message }}
          </p>
        </div>
      </div>

      <!-- ── USERS ── -->
      <div v-if="activeTab === 'users'" class="space-y-4">
        <div class="flex gap-2">
          <UInput v-model="userSearch" placeholder="Search users" icon="i-heroicons-magnifying-glass" class="flex-1" @keyup.enter="loadUsers" />
          <UButton variant="soft" color="neutral" :loading="usersLoading" @click="loadUsers">Search</UButton>
        </div>

        <UTable :data="users" :columns="userColumns" :loading="usersLoading">
          <template #email-cell="{ row }">
            <div class="flex items-center gap-2">
              <span class="break-all font-medium text-default">{{ row.original.email }}</span>
              <UBadge v-if="row.original.banned" color="error" variant="soft" size="xs">Banned</UBadge>
            </div>
          </template>
          <template #name-cell="{ row }">
            <span class="text-muted">{{ row.original.name || '—' }}</span>
          </template>
          <template #role-cell="{ row }">
            <UBadge :color="row.original.role === 'admin' ? 'primary' : 'neutral'" variant="soft" size="xs">{{ row.original.role || 'user' }}</UBadge>
          </template>
          <template #createdAt-cell="{ row }">
            <span class="text-sm text-muted">{{ formatDate(row.original.createdAt) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <UTooltip :text="row.original.role === 'admin' ? 'Cannot impersonate admin' : 'Impersonate user'">
              <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-arrow-right-on-rectangle" :disabled="row.original.role === 'admin'" :loading="impersonatingUserId === row.original.id" @click="impersonateUser(row.original.id)" />
            </UTooltip>
          </template>
        </UTable>
      </div>

      <!-- ── CONTENT ── -->
      <div v-if="activeTab === 'content'" class="space-y-3">
        <div v-for="page in ['about', 'contact', 'help']" :key="page" class="flex items-center justify-between rounded-xl border border-default px-5 py-4">
          <span class="font-medium text-default capitalize">{{ page }}</span>
          <UButton size="sm" variant="outline" @click="navigateTo(`/admin/content/${page}`)">Edit</UButton>
        </div>
      </div>

      <!-- ── BLOG ── -->
      <div v-if="activeTab === 'blog'" class="space-y-4">
        <div class="flex justify-end">
          <UButton size="sm" @click="navigateTo('/admin/blog/new')">New post</UButton>
        </div>
        <div v-if="blogError" class="text-sm text-error">{{ blogError }}</div>
        <div v-else-if="blogPosts.length === 0" class="text-sm text-muted py-4">No posts yet.</div>
        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div v-for="post in blogPosts" :key="post.id" class="flex items-center justify-between px-5 py-4">
            <div>
              <p class="font-medium text-default">{{ post.title }}</p>
              <p class="text-xs text-muted">{{ post.published_at ? formatDate(post.published_at) : 'Draft' }}</p>
            </div>
            <div class="flex gap-2">
              <UButton size="xs" variant="outline" @click="navigateTo(`/admin/blog/${post.id}`)">Edit</UButton>
              <UButton size="xs" variant="outline" color="error" :loading="deletingPostId === post.id" @click="openDeleteConfirm(post.id)">Delete</UButton>
            </div>
          </div>
        </div>
      </div>

    </UPageBody>
  </UPage>

  <!-- Send Handoff modal -->
  <UModal v-model:open="handoffOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Send Handoff</h3>
          <p class="text-sm text-muted mt-0.5">
            {{ handoffClient?.brand_name || handoffClient?.org_name }} — invite your client to claim ownership.
          </p>
        </div>

        <template v-if="!handoffResult">
          <div class="space-y-4">
            <UFormField label="Client email" required>
              <UInput v-model="handoffEmail" type="email" placeholder="owner@restaurant.com" class="w-full" />
            </UFormField>

            <UFormField label="Their domain (optional)">
              <UInput v-model="handoffDomain" placeholder="potteryhouse.com" class="w-full" />
              <template #help>If you've already set up DNS, enter it here — shown as a selling point in the email and claim page.</template>
            </UFormField>

            <UFormField label="Plan to invite them to">
              <USelect v-model="handoffPlan" :options="PLAN_OPTIONS" value-attribute="value" label-attribute="label" class="w-full" />
            </UFormField>

            <UFormField label="Stripe coupon code (optional)">
              <UInput v-model="handoffCoupon" placeholder="e.g. FRIEND50" class="w-full" />
              <template #help>Applied automatically at checkout. Use the coupon ID from your Stripe dashboard.</template>
            </UFormField>

            <UFormField label="Personal note (optional)">
              <UTextarea v-model="handoffMessage" placeholder="Your website is ready — I think you'll love it!" :rows="3" class="w-full" />
            </UFormField>
          </div>

          <p v-if="handoffError" class="text-sm text-error">{{ handoffError }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="handoffOpen = false">Cancel</UButton>
            <UButton
              color="primary"
              :loading="handoffSending"
              :disabled="!handoffEmail.trim()"
              icon="i-heroicons-paper-airplane"
              @click="sendHandoff"
            >
              Send invite email
            </UButton>
          </div>
        </template>

        <template v-else>
          <UAlert
            color="success"
            variant="soft"
            icon="i-heroicons-check-circle"
            :title="`Invite sent to ${handoffResult.to_email}`"
            :description="handoffResult.invited_plan ? `Plan: ${handoffResult.invited_plan} — they'll be taken to Stripe after claiming.` : 'No plan attached — they can choose after claiming.'"
          />

          <div>
            <p class="text-sm font-medium text-highlighted mb-2">Transfer link</p>
            <div class="flex gap-2">
              <UInput :model-value="handoffResult.transfer_url" readonly class="flex-1 font-mono text-xs" />
              <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="copyHandoffLink">Copy</UButton>
              <UButton
                color="success"
                variant="soft"
                icon="i-lucide-message-circle"
                :href="`https://wa.me/?text=${encodeURIComponent('Hi! Your website is ready — claim it here: ' + handoffResult.transfer_url)}`"
                target="_blank"
              >
                WhatsApp
              </UButton>
            </div>
            <p class="text-xs text-muted mt-2">An invite email was also sent automatically. Share this link as a backup via WhatsApp.</p>
          </div>

          <div class="flex justify-end">
            <UButton variant="ghost" color="neutral" @click="handoffOpen = false">Close</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>

  <!-- Delete post confirm modal -->
  <UModal v-model:open="deleteConfirmOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-default mb-2">Delete post?</h3>
        <p class="text-sm text-muted mb-6">This action cannot be undone.</p>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteConfirmOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deletingPostId !== null" @click="confirmDeletePost">Delete</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })

// ── Auth ─────────────────────────────────────────────────────────────────────
const toast = useToast()

// ── Routing ──────────────────────────────────────────────────────────────────
const route = useRoute()
const activeTab = computed(() => String(route.query.tab || 'queue'))

// ── Shared helpers ──────────────────────────────────────────────────────────
function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '—'
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Members ──────────────────────────────────────────────────────────────────
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
    const msg = err instanceof Error ? err.message : 'Failed to add team member'
    teamInviteResult.value = { error: true, message: msg }
  } finally {
    invitingTeam.value = false
  }
}

async function inviteClient() {
  const email = clientEmail.value.trim()
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
    const msg = err instanceof Error ? err.message : 'Failed to create invitation'
    clientInviteResult.value = { error: msg }
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

// ── Queue ───────────────────────────────────────────────────────────────────
interface Purchase {
  id: string
  organization_id: string
  org_name: string
  org_slug: string | null
  addon_type: string
  fulfilled_at: string | null
  created_at: string
}

const purchases = ref<Purchase[]>([])
const queueLoading = ref(false)
const fulfillingId = ref<string | null>(null)
const showAllPurchases = ref(false)



const ADDON_LABELS: Record<string, string> = {
  translation: 'Language Translation',
  seasonal: 'Seasonal Relaunch',
  gbp_setup: 'Google Business Optimization',
}
const ADDON_ICONS: Record<string, string> = {
  translation: 'i-heroicons-language',
  seasonal: 'i-heroicons-sparkles',
  gbp_setup: 'i-heroicons-map-pin',
}
const ADDON_COLORS: Record<string, string> = {
  translation: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  seasonal: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  gbp_setup: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
}

function addonLabel(type: string) { return ADDON_LABELS[type] ?? type }
function addonIcon(type: string) { return ADDON_ICONS[type] ?? 'i-heroicons-shopping-bag' }
function addonColor(type: string) { return ADDON_COLORS[type] ?? 'bg-muted text-muted' }

async function loadQueue() {
  queueLoading.value = true
  try {
    const res = await $fetch<{ purchases: Purchase[] }>(`/api/admin/fulfillment?all=${showAllPurchases.value ? '1' : '0'}`)
    purchases.value = res.purchases
  } catch {
    toast.add({ title: 'Failed to load queue', color: 'error' })
  } finally {
    queueLoading.value = false
  }
}

async function markDone(id: string) {
  fulfillingId.value = id
  try {
    await $fetch(`/api/admin/fulfillment/${id}/done`, { method: 'POST' })
    toast.add({ title: 'Marked as fulfilled', color: 'success' })
    await loadQueue()
  } catch {
    toast.add({ title: 'Failed to mark done', color: 'error' })
  } finally {
    fulfillingId.value = null
  }
}

// ── Clients ─────────────────────────────────────────────────────────────────
interface Client {
  org_id: string
  org_name: string
  org_slug: string | null
  plan: string
  site_id: string | null
  brand_name: string | null
  subdomain: string | null
  source_locale: string | null
  subscription_status: string | null
}

const clients = ref<Client[]>([])
const clientsLoading = ref(false)

const PLAN_LABELS: Record<string, string> = {
  growth: 'Growth',
  managed: 'Managed',
  seo_accelerator: 'SEO Accelerator',
}
const PLAN_COLORS: Record<string, 'primary' | 'success' | 'warning'> = {
  growth: 'warning',
  managed: 'primary',
  seo_accelerator: 'success',
}

function planLabel(plan: string) { return PLAN_LABELS[plan] ?? plan }
function planColor(plan: string) { return PLAN_COLORS[plan] ?? 'neutral' }

async function loadClients() {
  clientsLoading.value = true
  try {
    const res = await $fetch<{ clients: Client[] }>('/api/admin/clients')
    clients.value = res.clients
  } catch {
    toast.add({ title: 'Failed to load clients', color: 'error' })
  } finally {
    clientsLoading.value = false
  }
}

// ── Handoff modal ────────────────────────────────────────────────────────────
interface HandoffResult {
  transfer_url: string
  to_email: string
  site_name: string
  invited_plan: string | null
}

const handoffOpen = ref(false)
const handoffClient = ref<Client | null>(null)
const handoffEmail = ref('')
const handoffMessage = ref('')
const handoffPlan = ref('')
const handoffCoupon = ref('')
const handoffDomain = ref('')
const handoffSending = ref(false)
const handoffResult = ref<HandoffResult | null>(null)
const handoffError = ref('')

const PLAN_OPTIONS = [
  { label: 'No plan (they choose later)', value: '' },
  { label: 'Growth — $49/mo', value: 'growth' },
  { label: 'Managed — $149/mo', value: 'managed' },
  { label: 'SEO Accelerator — $349/mo', value: 'seo_accelerator' },
]

function openHandoff(client: Client) {
  handoffClient.value = client
  handoffEmail.value = ''
  handoffMessage.value = ''
  handoffPlan.value = ''
  handoffCoupon.value = ''
  handoffDomain.value = ''
  handoffResult.value = null
  handoffError.value = ''
  handoffOpen.value = true
}

async function sendHandoff() {
  if (!handoffClient.value?.site_id || !handoffEmail.value.trim()) return
  handoffSending.value = true
  handoffError.value = ''
  handoffResult.value = null
  try {
    const res = await $fetch<HandoffResult>(`/api/admin/sites/${handoffClient.value.site_id}/transfer`, {
      method: 'POST',
      body: {
        email: handoffEmail.value.trim(),
        message: handoffMessage.value.trim() || undefined,
        plan: handoffPlan.value || undefined,
        coupon: handoffCoupon.value.trim() || undefined,
        domain: handoffDomain.value.trim() || undefined,
      },
    })
    handoffResult.value = res
  } catch (err: unknown) {
    const data = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const msg = err instanceof Error ? err.message : null
    handoffError.value = data?.error ?? msg ?? 'Failed to send handoff'
  } finally {
    handoffSending.value = false
  }
}

async function copyHandoffLink() {
  if (!handoffResult.value?.transfer_url) return
  try {
    await navigator.clipboard.writeText(handoffResult.value.transfer_url)
    toast.add({ title: 'Link copied', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to copy', color: 'error' })
  }
}

// ── Analytics ───────────────────────────────────────────────────────────────
interface Analytics {
  metrics: { users: number; organizations: number; sites: number; posts: number; menus: number; locations: number }
  recentSites: { id: string; brand_name: string | null; subdomain: string | null; created_at: string }[]
}

const analytics = ref<Analytics | null>(null)
const analyticsLoading = ref(false)

const analyticsStats = computed(() => [
  { label: 'Users',         value: analytics.value?.metrics.users ?? '—' },
  { label: 'Organizations', value: analytics.value?.metrics.organizations ?? '—' },
  { label: 'Sites',         value: analytics.value?.metrics.sites ?? '—' },
  { label: 'Locations',     value: analytics.value?.metrics.locations ?? '—' },
  { label: 'Menus',         value: analytics.value?.metrics.menus ?? '—' },
  { label: 'Posts',         value: analytics.value?.metrics.posts ?? '—' },
])

async function loadAnalytics() {
  analyticsLoading.value = true
  try {
    analytics.value = await $fetch<Analytics>('/api/admin/analytics')
  } catch {
    toast.add({ title: 'Failed to load analytics', color: 'error' })
  } finally {
    analyticsLoading.value = false
  }
}

// ── Domains ─────────────────────────────────────────────────────────────────
interface Domain {
  id: string; domain: string; status: string; role: string
  site_name: string | null; organization_name: string | null
  cloudflare_hostname_id: string | null; error_message: string | null
}
interface DomainEvent { id: string; domain: string | null; event_type: string; message: string; created_at: string }

const domains = ref<Domain[]>([])
const domainEvents = ref<DomainEvent[]>([])
const domainSearch = ref('')
const domainsLoading = ref(false)
const syncingDomainId = ref<string | null>(null)

async function loadDomains() {
  domainsLoading.value = true
  try {
    const q = domainSearch.value.trim() ? `?q=${encodeURIComponent(domainSearch.value.trim())}` : ''
    const res = await $fetch<{ domains: Domain[]; events: DomainEvent[] }>(`/api/admin/domains${q}`)
    domains.value = res.domains ?? []
    domainEvents.value = res.events ?? []
  } catch {
    toast.add({ title: 'Failed to load domains', color: 'error' })
  } finally {
    domainsLoading.value = false
  }
}

async function syncDomain(id: string) {
  syncingDomainId.value = id
  try {
    await $fetch(`/api/admin/domains/${id}/sync`, { method: 'POST' })
    toast.add({ title: 'Domain synced', color: 'success' })
    await loadDomains()
  } catch {
    toast.add({ title: 'Failed to sync domain', color: 'error' })
  } finally {
    syncingDomainId.value = null
  }
}

// ── Users ───────────────────────────────────────────────────────────────────
interface AdminUser { id: string; email: string; name: string | null; role: string | null; banned: boolean; createdAt: string }

const users = ref<AdminUser[]>([])
const userSearch = ref('')
const usersLoading = ref(false)
const impersonatingUserId = ref<string | null>(null)

const userColumns = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'createdAt', header: 'Joined' },
  { id: 'actions', header: '' },
]

async function loadUsers() {
  usersLoading.value = true
  try {
    const q = userSearch.value.trim() ? `?q=${encodeURIComponent(userSearch.value.trim())}` : ''
    const res = await $fetch<{ users: AdminUser[] }>(`/api/admin/users${q}`)
    users.value = res.users ?? []
  } catch {
    toast.add({ title: 'Failed to load users', color: 'error' })
  } finally {
    usersLoading.value = false
  }
}

async function impersonateUser(userId: string) {
  impersonatingUserId.value = userId
  try {
    await $fetch('/api/admin/impersonation/start', { method: 'POST', body: { userId } })
    try {
      const { sites } = await $fetch<{ sites: { id: string }[] }>('/api/sites')
      const firstSite = sites?.[0]
      if (firstSite) {
        const { paths } = useDashboardSiteLinks(firstSite.id)
        await navigateTo(paths.value.base)
      } else {
        await navigateTo('/dashboard')
      }
    } catch {
      await navigateTo('/dashboard')
    }
  } catch {
    toast.add({ title: 'Failed to impersonate user', color: 'error' })
  } finally {
    impersonatingUserId.value = null
  }
}

// ── Blog ─────────────────────────────────────────────────────────────────────
interface BlogPost { id: string; title: string; published_at: string | null }

const blogPosts = ref<BlogPost[]>([])
const blogError = ref('')
const deleteConfirmOpen = ref(false)
const pendingDeletePostId = ref<string | null>(null)
const deletingPostId = ref<string | null>(null)

async function loadBlogPosts() {
  try {
    const res = await $fetch<{ posts: BlogPost[] }>('/api/admin/blog/posts')
    blogPosts.value = res.posts ?? []
    blogError.value = ''
  } catch {
    blogError.value = 'Failed to load posts.'
  }
}

function openDeleteConfirm(id: string) {
  pendingDeletePostId.value = id
  deleteConfirmOpen.value = true
}

async function confirmDeletePost() {
  if (!pendingDeletePostId.value) return
  deletingPostId.value = pendingDeletePostId.value
  try {
    await $fetch(`/api/admin/blog/posts/${pendingDeletePostId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Post deleted', color: 'success' })
    await loadBlogPosts()
  } catch {
    toast.add({ title: 'Failed to delete post', color: 'error' })
  } finally {
    deletingPostId.value = null
    deleteConfirmOpen.value = false
    pendingDeletePostId.value = null
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(() => {
  Promise.allSettled([loadQueue(), loadClients(), loadMembers(), loadAnalytics(), loadDomains(), loadUsers(), loadBlogPosts()])
})

useSeoMeta({ title: 'Platform Admin | KrabiClaw', robots: 'noindex, nofollow' })
</script>

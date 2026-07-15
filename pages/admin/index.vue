<template>
  <UPage>
    <UPageBody>

      <!-- ── WORK QUEUE ── -->
      <div v-if="activeTab === 'work'" class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex gap-2">
            <UCheckbox v-model="workShowDone" label="Show completed" @update:model-value="loadWorkRequests" />
          </div>
          <UButton color="neutral" variant="ghost" size="xs" :loading="workLoading" @click="loadWorkRequests">
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </UButton>
        </div>

        <UCard v-if="workLoading">
          <div class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" /></div>
        </UCard>

        <UCard v-else-if="workRequests.length === 0">
          <div class="text-center py-4">
            <UIcon name="i-lucide-list-todo" class="mx-auto size-10 text-muted mb-3" />
            <p class="font-semibold text-highlighted">No work requests</p>
            <p class="text-sm text-muted mt-1">Managed clients submit requests from their dashboard or via ChowBot.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="req in workRequests"
            :key="req.id"
            class="px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <div class="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="workTypeColor(req.type)">
                  <UIcon :name="workTypeIcon(req.type)" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-default">{{ req.title }}</p>
                    <UBadge :label="req.priority" :color="priorityColor(req.priority)" variant="soft" size="xs" class="capitalize" />
                    <UBadge :label="req.source" color="neutral" variant="soft" size="xs" />
                  </div>
                  <p class="text-sm text-muted truncate mt-0.5">
                    {{ req.brand_name || req.org_name }} · {{ formatDate(req.created_at) }}
                  </p>
                  <p v-if="req.description" class="text-sm text-muted mt-1 line-clamp-2">{{ req.description }}</p>
                  <p v-if="req.notes" class="text-xs text-primary mt-1 italic">Note: {{ req.notes }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <USelect
                  :model-value="req.status"
                  :items="[
                    { label: 'Pending', value: 'pending' },
                    { label: 'In Progress', value: 'in_progress' },
                    { label: 'Done', value: 'done' },
                    { label: 'Cancelled', value: 'cancelled' },
                  ]"
                  size="xs"
                  class="w-32"
                  @update:model-value="updateWorkRequest(req.id, { status: $event })"
                />
                <UButton
                  v-if="req.org_slug"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-external-link"
                  :to="`/dashboard/${req.org_slug}`"
                  target="_blank"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── QUEUE ── -->
      <div v-if="activeTab === 'queue'" class="space-y-4">
        <div class="flex justify-end">
          <UButton color="neutral" variant="ghost" size="xs" :loading="queueLoading" @click="loadQueue">
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </UButton>
        </div>

        <UCard v-if="queueLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="purchases.length === 0">
          <div class="text-center">
            <UIcon name="i-lucide-badge-check" class="mx-auto size-10 text-success mb-3" />
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
                icon="i-lucide-external-link"
                :to="`/dashboard/${purchase.org_slug}`"
                target="_blank"
              >
                View
              </UButton>
              <UButton
                size="xs"
                color="success"
                variant="soft"
                icon="i-lucide-check"
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
              :disabled="inviteMode === 'existing' && !selectedOrg"
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

      <!-- ── CLIENTS ── -->
      <div v-if="activeTab === 'clients'" class="space-y-4">
        <div class="flex justify-end">
          <UButton color="neutral" variant="ghost" size="xs" :loading="clientsLoading" @click="loadClients">
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </UButton>
        </div>

        <UCard v-if="clientsLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="clients.length === 0">
          <div class="text-center">
            <UIcon name="i-lucide-store" class="mx-auto size-10 text-muted mb-3" />
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
                <UIcon name="i-lucide-store" class="size-4" />
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
                icon="i-lucide-languages"
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
                icon="i-lucide-send"
                @click="openHandoff(client)"
              >
                Send Handoff
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-credit-card"
                @click="openBilling(client)"
              >
                Billing
              </UButton>
              <UButton
                v-if="client.org_slug"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-external-link"
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
          <UInput v-model="domainSearch" placeholder="Search domains" icon="i-lucide-search" class="flex-1" />
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
              <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-refresh-cw" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Sync</UButton>
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
          <UInput v-model="userSearch" placeholder="Search users" icon="i-lucide-search" class="flex-1" @keyup.enter="loadUsers" />
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
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-log-out" :disabled="row.original.role === 'admin'" :loading="impersonatingUserId === row.original.id" @click="impersonateUser(row.original.id)" />
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
              <template #help>If you enter a domain here, choose a paid plan too. The client must complete checkout before ownership transfers.</template>
            </UFormField>
            <p v-if="handoffDomainNeedsPlan" class="text-sm text-error -mt-2">
              A paid plan is required when inviting a client with a custom domain.
            </p>

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
              :disabled="!handoffEmail.trim() || handoffDomainNeedsPlan"
              icon="i-lucide-send"
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
            icon="i-lucide-circle-check"
            :title="`Invite sent to ${handoffResult.to_email}`"
            :description="handoffResult.invited_plan ? `Plan: ${handoffResult.invited_plan} — checkout happens before ownership transfers.` : 'No plan attached — ownership transfers as soon as they claim it.'"
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
            <p class="text-xs text-muted mt-2">An invite email was also sent automatically. This handoff link stays active until it is completed or cancelled.</p>
          </div>

          <div class="flex justify-end">
            <UButton variant="ghost" color="neutral" @click="handoffOpen = false">Close</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>

  <!-- Billing modal -->
  <UModal v-model:open="billingOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Billing</h3>
          <p class="text-sm text-muted mt-0.5">{{ billingClient?.brand_name || billingClient?.org_name }}</p>
        </div>

        <div v-if="billingLoading" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-8 rounded" />
        </div>

        <template v-else-if="billingError">
          <UAlert color="error" variant="soft" :description="billingError" />
        </template>

        <template v-else-if="billingStatus">
          <!-- Current subscription status -->
          <div class="rounded-xl border border-default divide-y divide-default text-sm">
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Plan</span>
              <UBadge v-if="billingStatus.plan" :label="planLabel(billingStatus.plan)" :color="planColor(billingStatus.plan)" variant="soft" size="xs" />
              <span v-else class="text-muted italic">None</span>
            </div>
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Status</span>
              <UBadge :label="billingStatus.status ?? 'not set'" :color="billingStatus.status === 'active' ? 'success' : 'neutral'" variant="soft" size="xs" />
            </div>
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Renews</span>
              <span class="text-default">{{ billingStatus.current_period_end ? formatDate(billingStatus.current_period_end) : '—' }}</span>
            </div>
            <div class="flex justify-between items-center px-4 py-2.5">
              <span class="text-muted">Stripe customer</span>
              <a
                v-if="billingStatus.stripe_customer_id"
                :href="`https://dashboard.stripe.com/customers/${billingStatus.stripe_customer_id}`"
                target="_blank"
                class="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {{ billingStatus.stripe_customer_id }}
                <UIcon name="i-lucide-external-link" class="size-3" />
              </a>
              <span v-else class="text-muted italic text-xs">Not created</span>
            </div>
            <div class="flex justify-between items-center px-4 py-2.5">
              <span class="text-muted">Subscription</span>
              <a
                v-if="billingStatus.stripe_subscription_id"
                :href="`https://dashboard.stripe.com/subscriptions/${billingStatus.stripe_subscription_id}`"
                target="_blank"
                class="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {{ billingStatus.stripe_subscription_id }}
                <UIcon name="i-lucide-external-link" class="size-3" />
              </a>
              <span v-else class="text-muted italic text-xs">None</span>
            </div>
          </div>

          <!-- Mark month paid (active cash subs only) -->
          <template v-if="billingStatus.status === 'active' && billingStatus.sites_billing?.[0]?.payment_method === 'cash'">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Mark month paid</p>
              <p class="text-xs text-muted">
                Collected cash in person? Finalize the outstanding Stripe invoice and advance the billing period.
              </p>
              <UAlert v-if="markPaidError" color="error" variant="soft" :description="markPaidError" />
              <UAlert v-if="markPaidResult" color="success" variant="soft" :title="`Period advanced to ${markPaidResult.new_period_end ? new Date(markPaidResult.new_period_end).toLocaleDateString() : 'N/A'}`" description="Invoice marked paid. Next reminder will fire closer to the new due date." />
              <UButton v-if="!markPaidResult" block color="success" :loading="markPaying" icon="i-lucide-circle-check" @click="markMonthPaid">
                Mark this month paid
              </UButton>
            </div>
          </template>

          <!-- Record cash payment (only if not already active) -->
          <template v-if="billingStatus.status !== 'active'">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Record cash payment</p>
              <div class="flex gap-2">
                <USelect v-model="cashPlan" :options="CASH_PLAN_OPTIONS" value-attribute="value" label-attribute="label" class="flex-1" size="sm" />
                <USelect
                  v-model="cashInterval"
                  :options="[{ label: 'Monthly', value: 'month' }, { label: 'Annual', value: 'year' }]"
                  value-attribute="value"
                  label-attribute="label"
                  size="sm"
                  class="w-32"
                />
              </div>
              <div class="flex gap-2">
                <UInput v-model.number="cashLocalRate" type="number" placeholder="Rate (e.g. 1500)" :min="0" size="sm" class="flex-1" />
                <UInput v-model="cashLocalCurrency" placeholder="Currency (e.g. THB)" size="sm" class="w-28" />
              </div>
              <p class="text-xs text-muted">Local rate + currency power the billing reminder emails.</p>
              <UAlert v-if="cashError" color="error" variant="soft" :description="cashError" />
              <UAlert v-if="cashResult" color="success" variant="soft" :title="`Payment recorded — ${cashResult.plan} ${cashResult.interval}ly`" :description="`$${(cashResult.amount_paid / 100).toFixed(2)} collected. Entitlements are now active.`" />
              <UButton v-if="!cashResult" block color="primary" :loading="cashPaying" icon="i-lucide-banknote" @click="recordCashPayment">
                Record cash payment
              </UButton>
            </div>
          </template>

          <!-- Pending transfer section -->
          <template v-if="billingStatus.pending_transfer">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Pending transfer</p>
              <div class="rounded-xl border border-default divide-y divide-default text-sm">
                <div class="flex justify-between px-4 py-2.5">
                  <span class="text-muted">Recipient</span>
                  <span class="text-default">{{ billingStatus.pending_transfer.to_email }}</span>
                </div>
                <div class="flex justify-between px-4 py-2.5">
                  <span class="text-muted">Has account</span>
                  <UBadge :label="billingStatus.pending_transfer.recipient_ready ? 'Yes' : 'Not yet'" :color="billingStatus.pending_transfer.recipient_ready ? 'success' : 'warning'" variant="soft" size="xs" />
                </div>
              </div>
              <UAlert v-if="!billingStatus.pending_transfer.recipient_ready" color="warning" variant="soft" description="Ask them to click the transfer link and create an account first — then you can force accept." />
              <UAlert v-if="forceAcceptError" color="error" variant="soft" :description="forceAcceptError" />
              <UAlert v-if="forceAcceptResult" color="success" variant="soft" :title="`Site transferred to ${forceAcceptResult.to_email}`" description="They can now access it in their dashboard." />
              <UButton
                v-if="billingStatus.pending_transfer.recipient_ready && !forceAcceptResult"
                block
                color="success"
                :loading="forceAccepting"
                icon="i-lucide-send"
                @click="forceAcceptTransfer"
              >
                Force transfer site now
              </UButton>
            </div>
          </template>
        </template>

        <div class="flex justify-end pt-2">
          <UButton variant="ghost" color="neutral" @click="billingOpen = false">Close</UButton>
        </div>
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
const activeTab = computed(() => String(route.query.tab || 'work'))

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
    const msg = err instanceof Error ? err.message : 'Failed to add team member'
    teamInviteResult.value = { error: true, message: msg }
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
      // Existing-org mode only: reset the org picker's search state and re-run the
      // search so the just-invited org drops out of the "no owner" browse list. The
      // new-org branch below has no equivalent search state to reset.
      selectedOrg.value = undefined
      orgSearchTerm.value = ''
      await runOrgSearch('')
    } catch (err: unknown) {
      clientInviteResult.value = { error: extractApiErrorMessage(err, 'Failed to create invitation') }
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
    clientInviteResult.value = { error: extractApiErrorMessage(err, 'Failed to create invitation') }
  } finally {
    invitingClient.value = false
  }
}

// $fetch throws an H3-style FetchError whose own `message` is a generic
// "[POST] ... 409 Conflict" — the actual server message (e.g. "Organization
// already has an owner") lives in `err.data.error`. Prefer that so 409s from
// /api/admin/invite/client render as the real reason, not a generic failure.
function extractApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data
  if (data?.error) return data.error
  if (err instanceof Error && err.message) return err.message
  return fallback
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
  translation: 'i-lucide-languages',
  seasonal: 'i-lucide-sparkles',
  gbp_setup: 'i-lucide-map-pin',
}
const ADDON_COLORS: Record<string, string> = {
  translation: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  seasonal: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  gbp_setup: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
}

function addonLabel(type: string) { return ADDON_LABELS[type] ?? type }
function addonIcon(type: string) { return ADDON_ICONS[type] ?? 'i-lucide-shopping-bag' }
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
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  pending_transfer_email: string | null
}

// ── Billing modal ────────────────────────────────────────────────────────────
interface BillingStatus {
  org_name: string
  org_slug: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  sites_billing: Array<{
    site_id: string
    brand_name: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    payment_method: string
    local_rate: number | null
    local_currency: string | null
  }>
  pending_transfer: {
    id: string
    site_id: string
    to_email: string
    invited_plan: string | null
    invited_interval: string
    invited_domain: string | null
    requires_payment: boolean
    created_at: string
    brand_name: string | null
    recipient_ready: boolean
  } | null
}

const billingOpen = ref(false)
const billingClient = ref<Client | null>(null)
const billingStatus = ref<BillingStatus | null>(null)
const billingLoading = ref(false)
const billingError = ref('')

const cashPlan = ref('growth')
const cashInterval = ref<'month' | 'year'>('year')
const cashLocalRate = ref<number | null>(null)
const cashLocalCurrency = ref('THB')
const cashPaying = ref(false)
const cashResult = ref<{ success: boolean; plan: string; interval: string; amount_paid: number } | null>(null)
const cashError = ref('')

const markPaying = ref(false)
const markPaidResult = ref<{ success: boolean; new_period_end: string | null } | null>(null)
const markPaidError = ref('')
const selectedCashSiteId = ref<string | null>(null)

const forceAccepting = ref(false)
const forceAcceptResult = ref<{ success: boolean; to_email: string } | null>(null)
const forceAcceptError = ref('')

const CASH_PLAN_OPTIONS = [
  { label: 'Growth — $49/mo · $588/yr', value: 'growth' },
  { label: 'Managed — $149/mo · $1,788/yr', value: 'managed' },
  { label: 'SEO Accelerator — $349/mo · $4,188/yr', value: 'seo_accelerator' },
]

async function openBilling(client: Client) {
  billingClient.value = client
  billingStatus.value = null
  billingError.value = ''
  cashResult.value = null
  cashError.value = ''
  markPaidResult.value = null
  markPaidError.value = ''
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  cashPlan.value = client.plan !== 'free' ? client.plan : 'growth'
  cashInterval.value = 'year'
  cashLocalRate.value = null
  cashLocalCurrency.value = 'THB'
  billingOpen.value = true
  billingLoading.value = true
  try {
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${client.org_id}/billing`)
  } catch (err: unknown) {
    const data = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    billingError.value = data?.error ?? 'Failed to load billing info'
  } finally {
    billingLoading.value = false
  }
}

async function recordCashPayment() {
  if (!billingClient.value) return
  if (cashLocalRate.value === null || cashLocalRate.value === undefined || cashLocalRate.value <= 0) {
    cashError.value = 'Please enter a valid positive rate'
    return
  }
  cashPaying.value = true
  cashResult.value = null
  cashError.value = ''
  try {
    const res = await $fetch<{ success: boolean; plan: string; interval: string; amount_paid: number }>(
      `/api/admin/organizations/${billingClient.value.org_id}/billing/cash-payment`,
      {
        method: 'POST',
        body: {
          plan: cashPlan.value,
          interval: cashInterval.value,
          siteId: billingClient.value?.site_id,
          localRate: cashLocalRate.value ?? undefined,
          localCurrency: cashLocalCurrency.value || undefined,
        },
      },
    )
    cashResult.value = res
    await loadClients()
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value.org_id}/billing`)
  } catch (err: unknown) {
    const data = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const msg = err instanceof Error ? err.message : null
    cashError.value = data?.error ?? msg ?? 'Failed to record payment'
  } finally {
    cashPaying.value = false
  }
}

async function markMonthPaid() {
  const cashSites = billingStatus.value?.sites_billing?.filter(s => s.payment_method === 'cash') ?? []
  const siteId = selectedCashSiteId.value || cashSites[0]?.site_id || billingClient.value?.site_id
  if (!siteId) return
  markPaying.value = true
  markPaidResult.value = null
  markPaidError.value = ''
  try {
    const res = await $fetch<{ success: boolean; new_period_end: string | null }>(
      `/api/admin/sites/${siteId}/billing/mark-paid`,
      { method: 'POST' },
    )
    markPaidResult.value = res
    await loadClients()
    if (billingClient.value) {
      billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value.org_id}/billing`)
    }
  } catch (err: unknown) {
    const data = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const msg = err instanceof Error ? err.message : null
    markPaidError.value = data?.error ?? msg ?? 'Failed to mark payment'
  } finally {
    markPaying.value = false
  }
}

async function forceAcceptTransfer() {
  if (!billingStatus.value?.pending_transfer?.site_id) return
  forceAccepting.value = true
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  try {
    const res = await $fetch<{ success: boolean; to_email: string }>(
      `/api/admin/sites/${billingStatus.value.pending_transfer.site_id}/transfer/force-accept`,
      { method: 'POST' },
    )
    forceAcceptResult.value = res
    await loadClients()
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value!.org_id}/billing`)
  } catch (err: unknown) {
    const data = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const msg = err instanceof Error ? err.message : null
    forceAcceptError.value = data?.error ?? msg ?? 'Failed to transfer site'
  } finally {
    forceAccepting.value = false
  }
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

const handoffDomainNeedsPlan = computed(() => Boolean(handoffDomain.value.trim()) && !handoffPlan.value)

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
  if (handoffDomainNeedsPlan.value) {
    handoffError.value = 'A paid plan is required when inviting a client with a custom domain.'
    return
  }
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
    const { refreshSession } = useAuth()
    await refreshSession()
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

// ── Work Requests ────────────────────────────────────────────────────────────
interface WorkRequest {
  id: string; type: string; title: string; description: string | null
  status: string; priority: string; source: string; notes: string | null
  org_name: string; org_slug: string | null; brand_name: string | null
  created_at: string; completed_at: string | null
}

const workRequests = ref<WorkRequest[]>([])
const workLoading = ref(false)
const workShowDone = ref(false)

const WORK_TYPE_ICONS: Record<string, string> = {
  content_update: 'i-lucide-file-text', menu_update: 'i-lucide-utensils',
  translation: 'i-lucide-languages', seo: 'i-lucide-trending-up',
  google_business: 'i-lucide-map-pin', seasonal: 'i-lucide-sparkles',
  photo_update: 'i-lucide-image', social_media: 'i-lucide-share-2',
  technical: 'i-lucide-wrench', other: 'i-lucide-circle-help',
}
const WORK_TYPE_COLORS: Record<string, string> = {
  content_update: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600',
  menu_update: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600',
  translation: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600',
  seo: 'bg-green-50 dark:bg-green-950/40 text-green-600',
  google_business: 'bg-red-50 dark:bg-red-950/40 text-red-500',
  seasonal: 'bg-orange-50 dark:bg-orange-950/40 text-orange-500',
  photo_update: 'bg-pink-50 dark:bg-pink-950/40 text-pink-500',
  social_media: 'bg-sky-50 dark:bg-sky-950/40 text-sky-500',
  technical: 'bg-slate-50 dark:bg-slate-950/40 text-slate-500',
  other: 'bg-muted text-muted',
}
const PRIORITY_COLORS: Record<string, 'error' | 'warning' | 'neutral' | 'success'> = {
  urgent: 'error', high: 'warning', normal: 'neutral', low: 'success',
}

function workTypeIcon(type: string) { return WORK_TYPE_ICONS[type] ?? 'i-lucide-circle-help' }
function workTypeColor(type: string) { return WORK_TYPE_COLORS[type] ?? 'bg-muted text-muted' }
function priorityColor(p: string) { return PRIORITY_COLORS[p] ?? 'neutral' }

async function loadWorkRequests() {
  workLoading.value = true
  try {
    const res = await $fetch<{ requests: WorkRequest[] }>(`/api/admin/work-requests?done=${workShowDone.value ? '1' : '0'}`)
    workRequests.value = res.requests
  } catch {
    toast.add({ title: 'Failed to load work requests', color: 'error' })
  } finally {
    workLoading.value = false
  }
}

async function updateWorkRequest(id: string, patch: { status?: string; notes?: string }) {
  try {
    await $fetch(`/api/admin/work-requests/${id}`, { method: 'PATCH', body: patch })
    await loadWorkRequests()
  } catch {
    toast.add({ title: 'Failed to update request', color: 'error' })
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(() => {
  Promise.allSettled([loadWorkRequests(), loadQueue(), loadClients(), loadMembers(), loadAnalytics(), loadDomains(), loadUsers(), loadBlogPosts()])
})

useSeoMeta({ title: 'Platform Admin | KrabiClaw', robots: 'noindex, nofollow' })
</script>

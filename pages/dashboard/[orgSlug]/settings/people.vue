<template>
  <DashboardIndexPanel id="platform-accounts" title="Platform accounts">
    <div class="mx-auto w-full max-w-3xl">
      <div class="space-y-6">
        <p class="text-sm text-muted">
          Every account on the platform. Impersonating opens that person's dashboard exactly as they see it; use their
          own pages for domains, billing, members and inbox, then stop impersonating from the banner.
        </p>

        <UAlert v-if="impersonateError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="impersonateError" />

        <!-- A link from the onboarding email names one account and the business
             it opens. Showing it never impersonates; the button does. -->
        <template v-if="target">
          <UAlert v-if="targetError" color="error" variant="soft" title="Could not open this customer" :description="targetError" />
          <div v-else-if="targetUser" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-elevated p-4" data-testid="focused-account">
            <div class="min-w-0">
              <p class="truncate text-base text-highlighted">{{ targetUser.name || targetUser.email }}</p>
              <p class="truncate text-sm text-muted">{{ targetUser.email }}</p>
            </div>
            <UButton
              size="sm"
              color="primary"
              class="rounded-full"
              :disabled="targetUser.id === currentUserId"
              :loading="impersonatingUserId === targetUser.id"
              @click="impersonate(targetUser.id, target.organizationId)"
            >
              Impersonate and open their business
            </UButton>
          </div>
          <USkeleton v-else class="h-20 rounded-lg" />
        </template>

        <UAlert v-if="loadError" color="error" variant="soft" title="Could not load accounts" :description="loadError" />

        <div v-else-if="loading" class="space-y-2">
          <USkeleton v-for="i in 6" :key="i" class="h-12 rounded-lg" />
        </div>

        <ul v-else>
          <li v-for="user in users" :key="user.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-default py-6 last:border-b-0">
            <div class="min-w-0">
              <p class="truncate text-base text-highlighted">{{ user.name || user.email }}</p>
              <p class="truncate text-sm text-muted">{{ user.email }}<span v-if="user.role && user.role !== 'user'"> · {{ user.role }}</span><span v-if="user.banned"> · banned</span></p>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              class="rounded-full"
              :disabled="user.id === currentUserId"
              :loading="impersonatingUserId === user.id"
              @click="impersonate(user.id)"
            >
              Impersonate
            </UButton>
          </li>
          <li v-if="!users.length" class="py-6 text-sm text-muted">No accounts yet.</li>
        </ul>
        <div v-if="total > pageSize" class="flex items-center justify-between gap-3">
          <p class="text-sm text-muted">Showing {{ offset + 1 }}–{{ offset + users.length }} of {{ total }}.</p>
          <div class="flex gap-2">
            <UButton color="neutral" variant="soft" :disabled="loading || offset === 0" @click="changePage(-1)">Previous</UButton>
            <UButton color="neutral" variant="soft" :disabled="loading || offset + users.length >= total" @click="changePage(1)">Next</UButton>
          </div>
        </div>
      </div>
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

// Every account on the platform, and the one platform-only tool a Better Auth
// admin has: pick a person and act as them. It sits beside Team and Billing
// because it is about accounts rather than about a site — under a site's URL it
// read as "this site's people", which it has never been. Menu shows the row only
// on Krabiclaw's own site.
definePageMeta({ layout: 'dashboard' })

useSeoMeta({ title: 'Platform accounts | Krabiclaw Dashboard', robots: 'noindex, nofollow' })

interface PlatformUser { id: string; name: string | null; email: string; role?: string | null; banned?: boolean | null }

const impersonateError = ref<string | null>(null)
const session = authClient.useSession()
const currentUser = computed(() => session.value.data?.user ?? null)
const refreshSession = () => session.value.refetch()
const currentUserId = computed(() => currentUser.value?.id ?? null)

const users = ref<PlatformUser[]>([])
const total = ref(0)
const pageSize = 50
const offset = ref(0)
const loading = ref(true)
const loadError = ref<string | null>(null)
const impersonatingUserId = ref<string | null>(null)

// Only the latest search may write the list; a slow earlier response is ignored.
let requestSequence = 0
async function loadUsers(nextOffset = offset.value) {
  const requestId = ++requestSequence
  loading.value = true
  loadError.value = null
  try {
    const result = await authClient.admin.listUsers({
      query: { limit: pageSize, offset: nextOffset, sortBy: 'createdAt', sortDirection: 'desc' },
    })
    if (result.error) throw new Error(result.error.message)
    if (requestId !== requestSequence) return
    users.value = result.data.users.map((user: { id: string, name?: string | null, email: string, role?: string | null, banned?: boolean | null }) => ({ id: user.id, name: user.name ?? null, email: user.email, role: user.role ?? null, banned: user.banned ?? null }))
    total.value = result.data.total
    offset.value = nextOffset
  } catch (error) {
    if (requestId !== requestSequence) return
    loadError.value = error instanceof Error ? error.message : 'Failed to load accounts.'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function changePage(direction: number) {
  await loadUsers(offset.value + direction * pageSize)
}

// With a business named, Better Auth makes it the impersonated session's active
// organization, which it refuses unless the person belongs to it; refused, the
// impersonation is stopped rather than left open on some other business.
async function impersonate(userId: string, organizationId?: string) {
  impersonatingUserId.value = userId
  impersonateError.value = null
  try {
    const result = await authClient.admin.impersonateUser({ userId })
    if (result.error) throw new Error(result.error.message)
    if (organizationId) {
      const active = await authClient.organization.setActive({ organizationId })
        .catch((error: unknown) => ({ data: null, error: { message: error instanceof Error ? error.message : String(error) } }))
      if (active.error || !active.data) {
        const stopped = await authClient.admin.stopImpersonating()
        if (stopped.error) throw new Error(`${active.error?.message ?? 'The business could not be opened'}, and impersonation could not be stopped: ${stopped.error.message}`)
        throw new Error(`This person cannot open that business: ${active.error?.message ?? 'it was not found'}`)
      }
      await refreshSession()
      await navigateTo(`/dashboard/${active.data.slug}`)
      return
    }
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (error) {
    impersonateError.value = error instanceof Error ? error.message : 'Failed to impersonate'
  } finally {
    impersonatingUserId.value = null
  }
}

const route = useRoute()
const target = computed(() => {
  const userId = typeof route.query.user === 'string' ? route.query.user : null
  const organizationId = typeof route.query.organization === 'string' ? route.query.organization : null
  return userId && organizationId ? { userId, organizationId } : null
})
const targetUser = ref<PlatformUser | null>(null)
const targetError = ref<string | null>(null)

async function loadTarget() {
  targetUser.value = null
  targetError.value = null
  const requested = target.value
  if (!requested) return
  const result = await authClient.admin.listUsers({
    query: { filterField: 'id', filterValue: requested.userId, filterOperator: 'eq', limit: 1 },
  })
  // Another link was opened while this one loaded.
  if (target.value?.userId !== requested.userId || target.value.organizationId !== requested.organizationId) return
  if (result.error) {
    targetError.value = result.error.message ?? 'Failed to load this account.'
    return
  }
  const user = result.data.users[0]
  if (!user) {
    targetError.value = 'This account no longer exists.'
    return
  }
  targetUser.value = { id: user.id, name: user.name ?? null, email: user.email, role: user.role ?? null, banned: user.banned ?? null }
}

watch(target, () => void loadTarget())

onMounted(() => {
  void loadUsers()
  void loadTarget()
})
</script>

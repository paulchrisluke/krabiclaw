<template>
  <DashboardIndexPanel id="platform-accounts" title="Platform accounts">
    <div class="mx-auto w-full max-w-3xl">
      <div class="space-y-6">
        <p class="text-sm text-muted">
          Every account on the platform. Impersonating opens that person's dashboard exactly as they see it; use their
          own pages for domains, billing, members and inbox, then stop impersonating from the banner.
        </p>

        <UAlert v-if="impersonateError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="impersonateError" />

        <UAlert v-if="loadError" color="error" variant="soft" title="Could not load accounts" :description="loadError" />

        <div v-else-if="loading" class="space-y-2">
          <USkeleton v-for="i in 6" :key="i" class="h-12 rounded-lg" />
        </div>

        <ul v-else class="divide-y divide-default rounded-2xl border border-default">
          <li v-for="user in users" :key="user.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ user.name || user.email }}</p>
              <p class="truncate text-xs text-muted">{{ user.email }}<span v-if="user.role && user.role !== 'user'"> · {{ user.role }}</span><span v-if="user.banned"> · banned</span></p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="user.id === currentUserId"
              :loading="impersonatingUserId === user.id"
              @click="impersonate(user.id)"
            >
              Impersonate
            </UButton>
          </li>
          <li v-if="!users.length" class="px-4 py-8 text-center text-sm text-muted">No accounts yet.</li>
        </ul>
        <div v-if="total > pageSize" class="flex items-center justify-between gap-3">
          <p class="text-xs text-muted">Showing {{ offset + 1 }}–{{ offset + users.length }} of {{ total }}.</p>
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

async function impersonate(userId: string) {
  impersonatingUserId.value = userId
  impersonateError.value = null
  try {
    const result = await authClient.admin.impersonateUser({ userId })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (error) {
    impersonateError.value = error instanceof Error ? error.message : 'Failed to impersonate'
  } finally {
    impersonatingUserId.value = null
  }
}

onMounted(() => void loadUsers())
</script>

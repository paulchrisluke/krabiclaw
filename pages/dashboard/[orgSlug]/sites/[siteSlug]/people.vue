<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      Every account on the platform. Impersonating opens that person's dashboard exactly as they see it; use their
      own pages for domains, billing, members and inbox, then stop impersonating from the banner.
    </p>

    <UInput v-model="search" icon="i-lucide-search" placeholder="Search by email" class="w-full max-w-md" />

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
      <li v-if="!users.length" class="px-4 py-8 text-center text-sm text-muted">No accounts match.</li>
    </ul>
    <p v-if="total > users.length" class="text-xs text-muted">Showing {{ users.length }} of {{ total }}. Narrow the search to find the rest.</p>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'

// KrabiClaw's own site gives a Better Auth admin the one platform-only tool: pick
// a person and act as them. Everything else is that tenant's ordinary dashboard.
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'People | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface PlatformUser { id: string; name: string | null; email: string; role?: string | null; banned?: boolean | null }

const toast = useToast()
const { user: currentUser, refresh: refreshSession } = await useAuthSession()
const currentUserId = computed(() => currentUser.value?.id ?? null)

const search = ref('')
const users = ref<PlatformUser[]>([])
const total = ref(0)
const loading = ref(true)
const loadError = ref<string | null>(null)
const impersonatingUserId = ref<string | null>(null)

// Only the latest search may write the list; a slow earlier response is ignored.
let requestSequence = 0
async function loadUsers() {
  const requestId = ++requestSequence
  loading.value = true
  loadError.value = null
  try {
    const query = search.value.trim()
    const result = await authClient.admin.listUsers({
      query: {
        limit: 50,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        ...(query ? { searchValue: query, searchField: 'email', searchOperator: 'contains' } : {}),
      },
    })
    if (result.error) throw new Error(result.error.message)
    if (requestId !== requestSequence) return
    users.value = result.data.users.map(user => ({ id: user.id, name: user.name ?? null, email: user.email, role: user.role ?? null, banned: user.banned ?? null }))
    total.value = result.data.total
  } catch (error) {
    if (requestId !== requestSequence) return
    loadError.value = error instanceof Error ? error.message : 'Failed to load accounts.'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function impersonate(userId: string) {
  impersonatingUserId.value = userId
  try {
    const result = await authClient.admin.impersonateUser({ userId })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (error) {
    toast.add({ title: 'Failed to impersonate', description: error instanceof Error ? error.message : undefined, color: 'error' })
  } finally {
    impersonatingUserId.value = null
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadUsers(), 250)
})
onMounted(() => void loadUsers())
</script>

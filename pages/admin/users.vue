<template>
  <UDashboardPanel id="admin-users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
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
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Users | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface AdminUser { id: string; email: string; name: string | null; role: string | null; banned: boolean; createdAt: string }

const users = ref<AdminUser[]>([])
const userSearch = ref('')
const usersLoading = ref(true)
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
    users.value = res.users
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

onMounted(loadUsers)
</script>

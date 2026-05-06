<template>
  <UDashboardGroup>
    <UDashboardSidebar 
      resizable 
      collapsible 
      :min-size="20" 
      :default-size="32" 
      :max-size="40"
      mode="drawer"
    >
      <template #header>
        <div class="flex items-center gap-2 p-4">
          <Icon name="i-heroicons-clipboard-document-list" class="w-5 h-5" />
          <h2 class="font-semibold text-gray-900">KrabiClaw Admin</h2>
        </div>
      </template>

      <template #body>
        <div class="space-y-1">
          <UButton
            to="/dashboard"
            variant="ghost"
            color="gray"
            class="w-full justify-start"
            :class="{ 'bg-gray-100': $route.path === '/dashboard' }"
          >
            <Icon name="i-heroicons-home" class="w-4 h-4" />
            Dashboard
          </UButton>

          <UButton
            to="/dashboard/reviews"
            variant="ghost"
            color="gray"
            class="w-full justify-start"
            :class="{ 'bg-gray-100': $route.path === '/dashboard/reviews' }"
          >
            <Icon name="i-heroicons-star" class="w-4 h-4" />
            Reviews
          </UButton>

          <UButton
            to="/dashboard/insights"
            variant="ghost"
            color="gray"
            class="w-full justify-start"
            :class="{ 'bg-gray-100': $route.path === '/dashboard/insights' }"
          >
            <Icon name="i-heroicons-chart-bar" class="w-4 h-4" />
            Insights
          </UButton>

          <UButton
            to="/dashboard/connection"
            variant="ghost"
            color="gray"
            class="w-full justify-start"
            :class="{ 'bg-gray-100': $route.path === '/dashboard/connection' }"
          >
            <Icon name="i-heroicons-link" class="w-4 h-4" />
            Connections
          </UButton>
        </div>
      </template>

      <template #footer>
        <div class="p-4 border-t border-gray-200">
          <UButton
            @click="handleSignOut"
            variant="ghost"
            color="red"
            size="sm"
            class="w-full justify-start"
          >
            <Icon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
            Sign Out
          </UButton>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar>
          <template #left>
            <DashboardSidebarToggle />
          </template>
          
          <template #right>
            <DashboardSearchButton />
            <UDropdown :items="userMenuItems">
              <UButton variant="ghost" color="gray" size="sm">
                <Icon name="i-heroicons-user-circle" class="w-4 h-4" />
                {{ session?.email }}
              </UButton>
            </UDropdown>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="p-6">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { authClient } from '~/utils/auth-client'

const { data: sessionData, signOut } = useAuth()
const session = computed(() => sessionData.value?.session)

const userMenuItems = [
  [{
    label: 'Profile',
    icon: 'i-heroicons-user',
    click: () => navigateTo('/dashboard/profile')
  }],
  [{
    label: 'Sign out',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    click: handleSignOut
  }]
]

async function handleSignOut() {
  await signOut()
  await navigateTo('/login')
}
</script>

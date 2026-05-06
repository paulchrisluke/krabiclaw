<template>
  <UDashboardGroup 
    unit="rem" 
    :min-size="3" 
    :default-size="4" 
    :max-size="8" 
    storage="local" 
    storage-key="dashboard-sidebar"
  >
    <UDashboardSidebar 
      resizable 
      collapsible
    >
      <template #header="{ collapsed }">
        <div v-if="!collapsed" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">K</span>
          </div>
          <h2 class="font-semibold text-gray-900 dark:text-white">KrabiClaw</h2>
        </div>
        <div v-else class="flex items-center justify-center">
          <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">K</span>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigationItems"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :avatar="{
            src: session.data?.user?.image,
            loading: 'lazy'
          }"
          :label="collapsed ? undefined : session.data?.user?.name"
          color="neutral"
          variant="ghost"
          class="w-full"
          :block="collapsed"
          @click="handleSignOut"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar>
          <template #right>
            <UColorModeButton variant="ghost" color="gray" size="sm" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { authClient } from '~/utils/auth-client'

const { data: sessionData, signOut } = useAuth()
const session = useSession()


const navigationItems = [[
  {
    label: 'Dashboard',
    icon: 'i-heroicons-home',
    to: '/dashboard',
    active: true
  },
  {
    label: 'Sites',
    icon: 'i-heroicons-globe-alt',
    to: '/dashboard/sites'
  },
  {
    label: 'Billing',
    icon: 'i-heroicons-credit-card',
    to: '/dashboard/billing'
  },
  {
    label: 'Integrations',
    icon: 'i-heroicons-link',
    to: '/dashboard/integrations'
  }
]]

const footerItems = [[
  {
    label: 'Feedback',
    icon: 'i-heroicons-chat-bubble-left-right',
    to: 'https://github.com/nuxt-ui-templates/dashboard',
    target: '_blank'
  },
  {
    label: 'Help & Support',
    icon: 'i-heroicons-information-circle',
    to: 'https://github.com/nuxt/ui',
    target: '_blank'
  }
]]

async function handleSignOut() {
  await signOut()
  await navigateTo('/login')
}
</script>

<template>
  <UDashboardPanel id="account-overview">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl space-y-4">
        <UCard v-for="item in items" :key="item.to" class="transition-shadow hover:shadow-md">
          <NuxtLink :to="item.to" class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <UIcon :name="item.icon" class="size-5 text-highlighted" />
              </div>
              <div>
                <p class="font-medium text-highlighted">{{ item.label }}</p>
                <p class="text-sm text-muted">{{ item.description }}</p>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
          </NuxtLink>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Account | KrabiClaw', robots: 'noindex, nofollow' })

const items = [
  { label: 'Profile', description: 'Your name, avatar, and personal account details.', icon: 'i-lucide-user', to: '/dashboard/account/profile' },
  { label: 'Authentication', description: 'Sign-in methods: email, Google, WhatsApp.', icon: 'i-lucide-shield', to: '/dashboard/account/authentication' },
  { label: 'Billing Items', description: 'Personal-account billing and payment history.', icon: 'i-lucide-receipt', to: '/dashboard/account/billing-items' },
]
</script>

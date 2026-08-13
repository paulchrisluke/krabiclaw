<template>
  <UDashboardPanel id="account-overview">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <DashboardNavbarLeading back-to-organization icon-only />
        </template>
        <template #right>
          <DashboardAccountMenu mobile-only class="md:hidden" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl divide-y divide-default">
          <NuxtLink v-for="item in items" :key="item.label" :to="item.to" class="flex min-h-20 items-center justify-between gap-4 py-4">
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
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Account | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const organizationQuery = computed(() => ({
  ...(typeof route.query.organization === 'string' ? { organization: route.query.organization } : {}),
  ...(typeof route.query.organizationName === 'string' ? { organizationName: route.query.organizationName } : {}),
}))
const items = computed(() => [
  { label: 'Profile', description: 'Your name, avatar, and personal account details.', icon: 'i-lucide-user', to: { path: '/dashboard/account/profile', query: organizationQuery.value } },
  { label: 'Authentication', description: 'Sign-in methods: email, Google, WhatsApp.', icon: 'i-lucide-shield', to: { path: '/dashboard/account/authentication', query: organizationQuery.value } },
  { label: 'Billing Items', description: 'Personal-account billing and payment history.', icon: 'i-lucide-receipt', to: { path: '/dashboard/account/billing-items', query: organizationQuery.value } },
])
</script>

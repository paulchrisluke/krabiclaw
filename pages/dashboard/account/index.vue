<template>
  <UDashboardPanel id="account-overview">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Account">
        <template #leading>
          <DashboardNavbarLeading back-to-organization />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-[var(--ws-page-narrow,45rem)] border-t border-default">
          <NuxtLink v-for="item in items" :key="item.label" :to="item.to" class="flex min-h-[var(--ws-row-min-height,66px)] items-center justify-between gap-4 border-b border-default py-[15px]">
            <div class="flex items-center gap-3.5">
              <UIcon :name="item.icon" class="size-5 shrink-0 text-muted" />
              <p class="text-[14.5px] font-semibold text-highlighted">{{ item.label }}</p>
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
  { label: 'Profile', icon: 'i-lucide-user', to: { path: '/dashboard/account/profile', query: organizationQuery.value } },
  { label: 'Authentication', icon: 'i-lucide-shield', to: { path: '/dashboard/account/authentication', query: organizationQuery.value } },
])
</script>

<template>
  <UDashboardPanel id="account-billing-items">
    <template #header>
      <UDashboardNavbar title="Billing Items">
        <template #leading>
          <DashboardNavbarLeading :detail-to="accountIndexTo" detail-label="Account" icon-only />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-10">
        
        <!-- Personal Section -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold text-highlighted">Personal</h3>

          <div class="border-y border-default py-4">
            <div class="flex min-h-12 items-center justify-between">
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-user" class="size-6 text-muted" />
                <span class="font-medium text-highlighted">{{ sessionData?.user?.name }} Account</span>
                <UBadge color="neutral" variant="soft" size="sm" class="rounded-full px-2">Free</UBadge>
              </div>
            </div>
          </div>
        </section>

        <!-- Sites Section -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold text-highlighted">Sites</h3>

          <div v-if="status === 'pending'" class="space-y-4">
            <USkeleton v-for="i in 2" :key="i" class="h-32 w-full rounded-lg" />
          </div>

          <div v-else-if="error" class="space-y-3 text-sm">
            <p class="text-muted">Failed to load your sites. Please try again.</p>
            <UButton color="neutral" variant="soft" size="sm" @click="refresh()">
              Retry
            </UButton>
          </div>

          <div v-else-if="!billingItems || billingItems.length === 0" class="text-sm text-muted">
            You are not a member of any sites.
          </div>

          <div v-else class="divide-y divide-default border-y border-default">
            <NuxtLink v-for="item in billingItems" :key="item.organization.id" :to="`/dashboard/${item.organization.slug}/settings/billing`" class="flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left">
              <div class="flex min-w-0 items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <UAvatar :src="item.organization.logo || undefined" :alt="item.organization.name" :ui="{ root: 'rounded-md' }" size="sm" />
                  <span class="truncate font-medium text-highlighted">{{ item.organization.name }}</span>
                  <UBadge color="primary" variant="soft" size="sm" class="rounded-full px-2 capitalize">
                    {{ item.billing.plan }}
                  </UBadge>
                  <UBadge :color="item.billing.subscriptionStatus === 'active' ? 'success' : 'neutral'" variant="soft" size="sm" class="rounded-full px-2 capitalize">
                    {{ item.billing.subscriptionStatus || 'active' }}
                  </UBadge>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </NuxtLink>
          </div>
        </section>

      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
// -nocheck
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Billing Items | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const { data: sessionData } = useAuth()
const route = useRoute()
const accountIndexTo = computed(() => ({
  path: '/dashboard/account',
  query: {
    ...(typeof route.query.organization === 'string' ? { organization: route.query.organization } : {}),
    ...(typeof route.query.organizationName === 'string' ? { organizationName: route.query.organizationName } : {}),
  },
}))
const requestEvent = useRequestEvent()

interface BillingItem {
  organization: {
    id: string
    name: string
    slug: string
    logo?: string | null
  }
  billing: {
    plan: string
    subscriptionStatus?: string | null
  }
}

const isBillingItemsResponse = (value: unknown): value is { items: BillingItem[] } =>
  isRecord(value)
  && Array.isArray(value.items)
  && value.items.every(item =>
    isRecord(item)
    && isRecord(item.organization)
    && typeof item.organization.id === 'string'
    && typeof item.organization.name === 'string'
    && typeof item.organization.slug === 'string'
    && isRecord(item.billing)
    && typeof item.billing.plan === 'string',
  )

const { data: billingItems, status, error, refresh } = await useAsyncData(
  'user-billing-items',
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getUserBillingItems }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/billing'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const session = await import('~/server/utils/auth').then(m => m.getAuthSession(requestEvent, env))
      if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
      return await getUserBillingItems(env, db.$client, session.user.id)
    }
    const response = await applicationFetch<{ items: BillingItem[] }>(
      '/api/user/billing-items',
      { validate: isBillingItemsResponse },
    )
    return response.items
  }
)

</script>

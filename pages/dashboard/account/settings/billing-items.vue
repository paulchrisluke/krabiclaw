<template>
  <UPage>

    <UPageBody>
      <div class="max-w-4xl space-y-10">
        
        <!-- Personal Section -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold text-highlighted">Personal</h3>

          <UCard :ui="{ body: 'p-4 sm:p-6', footer: 'px-4 py-3 sm:px-6 bg-elevated/30' }">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-user" class="size-6 text-muted" />
                <span class="font-medium text-highlighted">{{ sessionData?.user?.name }} Account</span>
                <UBadge color="neutral" variant="soft" size="sm" class="rounded-full px-2">Free</UBadge>
              </div>
            </div>
            <template #footer>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p class="text-sm text-muted">To manage your personal plan, visit your account's Billing and Usage settings page.</p>
                <UButton color="neutral" variant="soft" size="sm" :to="orgSettings.billing.value">
                  View All Plans
                </UButton>
              </div>
            </template>
          </UCard>
        </section>

        <!-- Restaurants Section -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold text-highlighted">Restaurants</h3>

          <div v-if="status === 'pending'" class="space-y-4">
            <USkeleton v-for="i in 2" :key="i" class="h-32 w-full rounded-lg" />
          </div>

          <div v-else-if="!billingItems?.length" class="text-sm text-muted">
            You are not a member of any restaurants.
          </div>

          <div v-else class="space-y-6">
            <UCard 
              v-for="item in billingItems" 
              :key="item.organization.id"
              :ui="{ body: 'p-4 sm:p-6', footer: 'px-4 py-3 sm:px-6 bg-elevated/30' }"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UAvatar :src="item.organization.logo || undefined" :alt="item.organization.name" :ui="{ root: 'rounded-md' }" size="sm" />
                  <span class="font-medium text-highlighted">{{ item.organization.name }}</span>
                  <UBadge color="primary" variant="soft" size="sm" class="rounded-full px-2 capitalize">
                    {{ item.billing.plan }}
                  </UBadge>
                  <UBadge :color="item.billing.subscriptionStatus === 'active' ? 'success' : 'neutral'" variant="soft" size="sm" class="rounded-full px-2 capitalize">
                    {{ item.billing.subscriptionStatus || 'active' }}
                  </UBadge>
                </div>
              </div>
              <template #footer>
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p class="text-sm text-muted">Visit {{ item.organization.name }}'s billing settings for details.</p>
                  <UButton color="neutral" variant="soft" size="sm" @click="goToWorkspaceBilling(item.organization.id)">
                    View Billing Settings
                  </UButton>
                </div>
              </template>
            </UCard>
          </div>
        </section>

      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
// -nocheck
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Billing Items | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const orgSettings = useOrgSettings()
const { data: sessionData } = useAuth()
const router = useRouter()

interface BillingItem {
  organization: {
    id: string
    name: string
    logo?: string | null
  }
  billing: {
    plan: string
    subscriptionStatus?: string | null
  }
}

const { data: response, status } = useFetch<{ items: BillingItem[] }>('/api/user/billing-items')
const billingItems = computed(() => response.value?.items ?? [])

const goToWorkspaceBilling = async (orgId: string) => {
  await router.push({ path: orgSettings.billing.value, query: { organizationId: orgId } })
}
</script>

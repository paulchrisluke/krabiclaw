<template>
  <!--
    Airbnb's account "Payments": one page, tabs across the top — Payouts, Plan,
    Fees — reached from the Earnings cog. The tab is in the URL, as Messages'
    view is, so a reload and a deep link land on the same one.
  -->
  <DashboardIndexPanel id="organization-payments" title="Payments">
    <div class="mx-auto w-full max-w-3xl pb-10">
      <UTabs v-model="tab" :items="tabs" :content="false" color="neutral" aria-label="Payments section" class="mb-8" />
      <PayoutMethodSettings v-if="tab === 'payouts'" />
      <PlanSettings v-else-if="tab === 'plan'" />
      <PaymentsFeesSettings v-else />
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import PayoutMethodSettings from '~/components/dashboard/settings/PayoutMethodSettings.vue'
import PlanSettings from '~/components/dashboard/settings/PlanSettings.vue'
import PaymentsFeesSettings from '~/components/dashboard/settings/PaymentsFeesSettings.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Payments | Krabiclaw', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
type Tab = 'payouts' | 'plan' | 'fees'
const tabs: Array<{ label: string; value: Tab }> = [
  { label: 'Payouts', value: 'payouts' },
  { label: 'Plan', value: 'plan' },
  { label: 'Fees and invoices', value: 'fees' },
]
const tab = computed<string | number>({
  get: () => route.query.tab === 'plan' || route.query.tab === 'fees' ? String(route.query.tab) : 'payouts',
  set: value => void router.replace({ query: { ...route.query, tab: value === 'payouts' ? undefined : String(value) } }),
})
</script>

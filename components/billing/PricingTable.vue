<template>
  <div>
    <!-- Primary plans -->
    <div
      class="grid grid-cols-1 gap-6 items-stretch mx-auto lg:grid-cols-2 max-w-3xl"
    >
      <div
        v-for="plan in mainPlans"
        :key="plan.id"
        :class="plan.highlighted ? 'sm:-mt-4 sm:mb-4' : ''"
        class="flex flex-col"
      >
        <BillingPlanCard :plan="plan" :annual="false" class="h-full flex-1" />
      </div>
    </div>

    <PlatformPricingComparison class="mt-24" />
  </div>
</template>

<script setup lang="ts">
import type { Plan } from '~/server/api/billing/plans.get'
import { NEW_SALE_PLAN_ID, STARTER_PLAN_ID } from '~/shared/billing-model'
import PlatformPricingComparison from '~/components/platform/marketing/PlatformPricingComparison.vue'

const props = defineProps<{
  plans: Plan[]
}>()

const MAIN_PLAN_IDS: ReadonlySet<string> = new Set([STARTER_PLAN_ID, NEW_SALE_PLAN_ID])
const mainPlans = computed(() => props.plans.filter(p => MAIN_PLAN_IDS.has(p.id)))
</script>

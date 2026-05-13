<template>
  <div
    class="rounded-2xl flex flex-col"
    :class="[
      isHighlighted
        ? 'bg-inverted text-white shadow-lg p-8'
        : 'bg-elevated border border-default p-8',
      isHighlighted && 'ring-2 ring-primary',
    ]"
  >
    <!-- Plan image -->
    <div v-if="plan.image" class="mb-6 rounded-xl overflow-hidden aspect-square w-20">
      <img :src="plan.image" :alt="plan.name" class="w-full h-full object-cover" />
    </div>

    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h3 class="text-2xl font-bold mb-1" :class="isHighlighted ? 'text-white' : 'text-default'">
          {{ plan.name }}
        </h3>
        <p class="text-sm" :class="isHighlighted ? 'text-white/70' : 'text-muted'">
          {{ plan.tagline }}
        </p>
      </div>
      <span
        v-if="plan.badge"
        class="shrink-0 px-3 py-1 text-sm font-bold rounded-full text-white"
        style="background-color: var(--kc-coral-600)"
      >
        {{ plan.badge }}
      </span>
    </div>

    <!-- Price -->
    <div class="mb-6">
      <template v-if="plan.prices.length === 0">
        <span class="text-4xl font-bold" :class="isHighlighted ? 'text-white' : 'text-default'">$0</span>
        <span :class="isHighlighted ? 'text-white/70' : 'text-muted'">/month</span>
      </template>
      <template v-else>
        <span class="text-4xl font-bold" :class="isHighlighted ? 'text-white' : 'text-default'">
          {{ currentPrice }}
        </span>
        <span :class="isHighlighted ? 'text-white/70' : 'text-muted'">
          {{ billingPeriodLabel }}
        </span>
        <p v-if="annual && savingsNote" class="text-sm mt-1" :class="isHighlighted ? 'text-emerald-400' : 'text-emerald-600'">
          {{ savingsNote }}
        </p>
      </template>
    </div>

    <!-- Features -->
    <ul class="space-y-3 mb-8 flex-1">
      <li
        v-for="feature in plan.features"
        :key="feature"
        class="flex items-start gap-2 text-sm"
        :class="isHighlighted ? 'text-white/85' : 'text-muted'"
      >
        <svg
          class="w-5 h-5 shrink-0 mt-0.5"
          :class="isHighlighted ? 'text-green-400' : 'text-green-500'"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        <span>{{ feature }}</span>
      </li>
    </ul>

    <!-- CTA -->
    <slot name="cta">
      <UButton
        v-if="plan.cta"
        :to="plan.cta.href"
        :variant="isHighlighted ? 'solid' : 'outline'"
        :color="isHighlighted ? 'neutral' : 'neutral'"
        size="xl"
        block
        :class="isHighlighted ? 'text-white hover:opacity-90' : ''"
        :style="isHighlighted ? 'background-color: var(--kc-coral-600)' : ''"
      >
        {{ plan.cta.label }}
      </UButton>
    </slot>
  </div>
</template>

<script setup lang="ts">
import type { Plan } from '~/composables/usePlans'

const props = defineProps<{
  plan: Plan
  annual?: boolean
  highlighted?: boolean
}>()

const { displayPrice, annualPrice, monthlyPrice } = usePlans()

const isHighlighted = computed(() => props.highlighted ?? props.plan.highlighted)

const currentPrice = computed(() => displayPrice(props.plan, props.annual ?? false))

const billingPeriodLabel = computed(() => {
  const annual = props.annual ?? false
  if (annual && props.plan.id === 'agency') return '/year'
  if (annual && props.plan.id !== 'agency') return '/location/year'
  if (!annual && props.plan.id === 'agency') return '/month'
  return '/location/month'
})

const savingsNote = computed(() => {
  if (!props.annual) return null
  const monthly = monthlyPrice(props.plan)
  const annual = annualPrice(props.plan)
  if (!monthly || !annual) return null
  const annualAsMonthly = Math.round(annual / 12)
  if (props.plan.id === 'pro') {
    const savedPerYear = monthly * 12 - annual
    const basePrice = `≈ $${(annualAsMonthly / 100).toFixed(2)}/month`
    if (savedPerYear > 0) {
      return `${basePrice} — save $${(savedPerYear / 100).toFixed(0)}/year per location`
    }
    return basePrice
  }
  return '2 months free'
})
</script>

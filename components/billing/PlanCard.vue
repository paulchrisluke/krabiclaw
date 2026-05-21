<template>
  <div
    class="relative rounded-[28px] flex flex-col p-8 transition-all duration-300 overflow-hidden"
    :class="[
      isHighlighted
        ? 'bg-gradient-to-b from-zinc-900 to-zinc-950 text-white shadow-2xl border border-primary/55 ring-1 ring-primary/20 scale-[1.02] md:scale-105 z-10'
        : 'bg-elevated/70 backdrop-blur-md border border-default/70 hover:border-primary/35 hover:-translate-y-1 hover:shadow-xl shadow-sm text-default',
    ]"
  >
    <!-- Highlight Gradient Light for Premium Card -->
    <div v-if="isHighlighted" class="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl opacity-60"></div>
    <div v-if="isHighlighted" class="absolute -bottom-24 -left-24 w-48 h-48 bg-(--kc-teal)/20 rounded-full blur-3xl opacity-40"></div>

    <!-- Plan image -->
    <div v-if="plan.image" class="mb-6 rounded-2xl overflow-hidden aspect-square w-16 border border-default bg-elevated/50 p-2 flex items-center justify-center">
      <img :src="plan.image" :alt="plan.name" class="w-full h-full object-contain" />
    </div>

    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-3 relative z-10">
      <div>
        <h3 class="text-2xl font-black tracking-tight mb-1.5" :class="isHighlighted ? 'text-white' : 'text-default'">
          {{ plan.name }}
        </h3>
        <p class="text-xs leading-relaxed" :class="isHighlighted ? 'text-white/60' : 'text-muted'">
          {{ plan.tagline }}
        </p>
      </div>
      <span
        v-if="plan.badge"
        class="shrink-0 px-3.5 py-1 text-[11px] font-black tracking-widest uppercase rounded-full text-white bg-gradient-to-r from-primary to-(--kc-coral) shadow-md"
      >
        {{ plan.badge }}
      </span>
    </div>

    <!-- Price -->
    <div class="mb-6 relative z-10">
      <template v-if="plan.prices.length === 0">
        <div class="flex items-baseline gap-1">
          <span class="text-5xl font-black tracking-tight" :class="isHighlighted ? 'text-white' : 'text-default'">$0</span>
          <span class="text-sm font-semibold" :class="isHighlighted ? 'text-white/50' : 'text-muted'">/month</span>
        </div>
      </template>
      <template v-else>
        <div class="flex items-baseline gap-1">
          <span class="text-5xl font-black tracking-tight" :class="isHighlighted ? 'text-white' : 'text-default'">
            {{ currentPrice }}
          </span>
          <span class="text-sm font-semibold" :class="isHighlighted ? 'text-white/50' : 'text-muted'">
            {{ billingPeriodLabel }}
          </span>
        </div>
        <p v-if="annual && savingsNote" class="text-xs font-semibold mt-2.5 flex items-center gap-1.5" :class="isHighlighted ? 'text-emerald-400' : 'text-emerald-600'">
          <UIcon name="i-heroicons-sparkles" class="size-3.5 shrink-0" />
          {{ savingsNote }}
        </p>
      </template>
    </div>

    <!-- Divider -->
    <div class="h-px w-full my-1 border-b" :class="isHighlighted ? 'border-white/10' : 'border-default/50'"></div>

    <!-- Features -->
    <ul class="space-y-4 my-6 flex-1 relative z-10">
      <li
        v-for="feature in plan.features"
        :key="feature"
        class="flex items-start gap-3 text-[13.5px] leading-relaxed"
        :class="isHighlighted ? 'text-white/80' : 'text-muted'"
      >
        <div 
          class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          :class="isHighlighted ? 'bg-primary/20 text-primary-300' : 'bg-primary/10 text-primary-600'"
        >
          <UIcon name="i-heroicons-check" class="size-3" />
        </div>
        <span>{{ feature }}</span>
      </li>
    </ul>

    <!-- CTA -->
    <div class="relative z-10 mt-auto pt-4">
      <slot name="cta">
        <UButton
          v-if="plan.cta"
          :to="plan.cta.href"
          :variant="isHighlighted ? 'solid' : 'outline'"
          size="xl"
          block
          class="rounded-xl font-bold transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md"
          :class="[
            isHighlighted 
              ? 'bg-primary hover:bg-primary/95 text-white hover:scale-[1.01]' 
              : 'text-default border-default hover:bg-primary/5 hover:border-primary/50'
          ]"
        >
          {{ plan.cta.label }}
        </UButton>
      </slot>
    </div>
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
  if (annual && props.plan.id === 'enterprise') return '/year'
  if (annual && props.plan.id !== 'enterprise') return '/location/year'
  if (!annual && props.plan.id === 'enterprise') return '/month'
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

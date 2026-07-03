<template>
  <div class="relative overflow-hidden bg-default min-h-screen py-20 lg:py-28">
    <div class="absolute top-0 right-1/4 -z-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
    <div class="absolute bottom-1/3 left-1/4 -z-10 w-125 h-125 bg-(--kc-teal)/10 rounded-full blur-3xl opacity-40" />

    <div class="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
      <div class="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center gap-4">
        <h1 class="text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.05] tracking-tight text-default text-balance m-0">
          Simple, <span class="bg-linear-to-r from-primary via-(--kc-coral) to-(--kc-teal) bg-clip-text text-transparent">transparent</span> pricing.
        </h1>
        <p class="text-lg leading-relaxed text-muted m-0 max-w-2xl">
          Start free. Upgrade when you're ready — we handle translations, marketing, and your Google presence.
        </p>
      </div>

      <div class="relative bg-elevated/20 backdrop-blur-md shadow-2xl border border-default/50 rounded-4xl overflow-hidden">
        <div class="p-6 sm:p-10">
          <BillingPricingTable :plans="plans" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { plans } = usePlans()

useSeoMeta({
  title: 'Billing & Plans | KrabiClaw',
  description: 'Managed business websites from $49/month. Start free, upgrade when ready.',
})
</script>

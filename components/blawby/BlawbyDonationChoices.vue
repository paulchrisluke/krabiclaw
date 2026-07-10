<template>
  <div v-if="tiers.length && destination" class="mx-auto grid max-w-4xl gap-8 lg:grid-cols-2">
    <article
      v-for="tier in tiers"
      :key="`${tier.title}-${tier.amount}`"
      class="relative rounded-2xl p-8 shadow-lg"
      :class="tier.featured ? 'bg-[var(--blawby-primary-dark)] text-white' : 'bg-white text-[var(--blawby-primary-dark)]'"
    >
      <div v-if="tier.featured" class="absolute -top-4 left-1/2 -translate-x-1/2">
        <span class="inline-flex items-center rounded-full bg-[var(--blawby-accent-strong)] px-4 py-1 text-sm font-medium text-white">
          Most Popular
        </span>
      </div>
      <div class="text-center">
        <div
          class="mx-auto flex size-16 items-center justify-center rounded-xl"
          :class="tier.featured ? 'bg-[var(--blawby-accent-200)]' : 'bg-[var(--blawby-primary-100)]'"
        >
          <BlawbyFeatureIcon
            :name="tier.icon"
            class="size-8"
            :class="tier.featured ? 'text-[var(--blawby-accent-strong)]' : 'text-[var(--blawby-primary)]'"
          />
        </div>
        <h2 class="mt-6 text-xl font-semibold">{{ tier.title }}</h2>
        <p class="mt-2 text-sm opacity-80">{{ tier.description }}</p>
        <div class="mt-4 text-4xl font-bold">${{ tier.amount }}</div>
        <BlawbyButton :to="destination" class="mt-6 w-full" @click="$emit('click')">
          Donate ${{ tier.amount }}
        </BlawbyButton>
      </div>
    </article>

    <article class="relative rounded-2xl bg-white p-8 text-[var(--blawby-primary-dark)] shadow-lg">
      <div class="text-center">
        <div class="mx-auto flex size-16 items-center justify-center rounded-xl bg-[var(--blawby-primary-100)]">
          <BlawbyFeatureIcon name="HeartIcon" class="size-8 text-[var(--blawby-primary)]" />
        </div>
        <h2 class="mt-6 text-xl font-semibold">Custom Amount</h2>
        <p class="mt-2 text-sm text-gray-500">Choose your own donation amount</p>
        <BlawbyButton :to="destination" class="mt-6 w-full" @click="$emit('click')">
          Donate custom amount
        </BlawbyButton>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tiers: Array<{
    amount: number
    title: string
    description: string
    featured: boolean
    icon: string
  }>
  destination?: string | null
}>()

defineEmits<{ click: [] }>()
</script>

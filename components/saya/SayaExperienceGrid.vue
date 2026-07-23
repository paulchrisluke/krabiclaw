<template>
  <div v-if="pending" class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="i in 3" :key="i" class="animate-pulse">
      <div class="aspect-[4/3] rounded-lg bg-muted" />
      <div class="mt-4 h-4 w-2/3 rounded bg-muted" />
      <div class="mt-2 h-3 w-full rounded bg-muted" />
    </div>
  </div>

  <div v-else-if="!experiences.length" class="py-24 text-center text-muted">
    <p class="text-sm">{{ emptyLabel }}</p>
  </div>

  <div v-else class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
    <NuxtLink
      v-for="experience in experiences"
      :key="experience.id"
      :to="`/experiences/${experience.slug}`"
      class="group block no-underline"
    >
      <div class="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        <img
          v-if="experience.image_url"
          :src="experience.image_url"
          :alt="experience.title"
          class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        >
        <div v-else class="flex h-full items-center justify-center">
          <SayaIcon name="sparkles" class="size-12 text-dimmed" />
        </div>
        <SayaBadgeUnavailable
          v-if="unavailabilityBadge(experience)"
          overlay
          :text="unavailabilityBadge(experience)!"
        />
      </div>

      <div class="mt-5">
        <h2 class="text-lg font-semibold text-default transition-colors group-hover:text-primary">
          {{ experience.title }}
        </h2>
        <p v-if="experience.tagline" class="mt-1 line-clamp-2 text-sm text-muted">
          {{ experience.tagline }}
        </p>

        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
          <span v-if="experience.price" class="flex items-center gap-1">
            <SayaIcon name="banknotes" class="size-3.5" />
            {{ experience.price }}
          </span>
          <span v-if="experience.duration_minutes" class="flex items-center gap-1">
            <SayaIcon name="clock" class="size-3.5" />
            {{ formatDuration(experience.duration_minutes) }}
          </span>
          <span v-if="experience.max_capacity" class="flex items-center gap-1">
            <SayaIcon name="user-group" class="size-3.5" />
            {{ experience.max_capacity }} {{ guestsMaxLabel }}
          </span>
        </div>

        <div class="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          {{ viewExperienceCta }}
          <SayaIcon name="arrow-right" class="size-3.5 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { Experience } from '~/server/utils/experiences'

const props = defineProps<{
  experiences: Experience[]
  pending?: boolean
  emptyLabel: string
  viewExperienceCta: string
  guestsMaxLabel: string
  soldOutLabel: string
  temporarilyUnavailableLabel: string
  fullyBookedLabel: string
  notScheduledLabel: string
}>()

function unavailabilityBadge(experience: Experience): string | null {
  switch (experience.availability_state) {
    case 'sold_out': return props.soldOutLabel
    case 'temporarily_unavailable': return props.temporarilyUnavailableLabel
    case 'full': return props.fullyBookedLabel
    case 'no_slots': return props.notScheduledLabel
    default: return null
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
</script>

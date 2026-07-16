<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-sparkles" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="space-y-4 px-4 pb-4">
      <div class="space-y-2">
        <div
          v-for="item in items"
          :key="item.title"
          class="rounded-xl border border-default bg-default px-3 py-2.5"
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UIcon :name="item.icon" class="size-3.5" />
            </div>
            <div class="min-w-0">
              <p class="text-[12px] font-semibold text-highlighted">{{ item.title }}</p>
              <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted">{{ item.body }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="primaryTo"
          size="sm"
          color="primary"
          :to="primaryTo"
        >
          {{ primaryLabel }}
        </UButton>
        <UButton
          v-if="secondaryTo"
          size="sm"
          color="neutral"
          variant="ghost"
          :to="secondaryTo"
        >
          {{ secondaryLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { SiteVertical } from '~/utils/vertical-copy'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  vertical: SiteVertical
  primaryLabel?: string
  primaryTo?: string | null
  secondaryLabel?: string
  secondaryTo?: string | null
}>(), {
  title: 'Finish the first impression',
  description: 'Once the workspace exists, this is the right time to polish the parts guests notice first.',
  primaryLabel: 'Open the dashboard',
  primaryTo: null,
  secondaryLabel: 'Open brand pages',
  secondaryTo: null,
})

const items = computed(() => [
  {
    icon: 'i-lucide-file-text',
    title: props.vertical === 'experience'
      ? 'Add your headline experiences'
      : props.vertical === 'professional_service'
        ? 'Add your core services'
        : 'Add your core menu or offerings',
    body: props.vertical === 'experience'
      ? 'Start with the signature experiences people book first, then expand the catalog.'
      : props.vertical === 'professional_service'
        ? 'Start with the services or practice areas clients ask about most, then fill in the rest.'
        : 'Start with the best sellers and key sections, then fill in the rest once the structure feels right.',
  },
  {
    icon: 'i-lucide-message-square-text',
    title: 'Write the story and voice',
    body: 'About copy, hero messaging, and trust-building details are best added after the facts are in place.',
  },
])
</script>

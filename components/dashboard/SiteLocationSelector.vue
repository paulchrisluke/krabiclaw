<template>
  <div class="selector-grid">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      :to="item.to"
      :aria-label="item.label"
      class="group min-w-0"
    >
      <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden bg-transparent shadow-none ring-0">
        <img
          v-if="item.imageUrl"
          :src="item.imageUrl"
          :alt="`${item.label} preview`"
          class="aspect-[40/21] w-full rounded-2xl border border-default bg-elevated object-cover shadow-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.01] group-hover:shadow-lg"
          loading="lazy"
          decoding="async"
        />
        <div v-else class="flex aspect-[40/21] items-center justify-center rounded-2xl border border-default bg-elevated text-muted">
          <UIcon name="i-lucide-image-off" class="size-8" />
        </div>
      </UCard>
    </NuxtLink>

    <NuxtLink
      v-if="addAction"
      :to="addAction.to"
      :aria-label="addAction.label"
      class="group min-w-0"
    >
      <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden bg-transparent shadow-none ring-0">
        <div class="flex aspect-[40/21] items-center justify-center rounded-2xl border border-dashed border-default bg-elevated transition group-hover:-translate-y-0.5 group-hover:border-primary group-hover:bg-muted group-hover:shadow-lg">
          <div class="flex size-14 items-center justify-center rounded-full border border-default bg-default shadow-sm">
            <UIcon name="i-lucide-plus" class="size-6 text-muted transition group-hover:text-primary" />
          </div>
        </div>
      </UCard>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
export interface SiteLocationSelectorItem {
  id: string
  label: string
  imageUrl: string | null
  to: string
}

defineProps<{
  items: SiteLocationSelectorItem[]
  addAction?: { label: string; to: string }
}>()
</script>

<style scoped>
.selector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr));
  gap: 1.5rem;
}
</style>

<template>
  <div class="space-y-8">
    <section v-for="group in groups" :key="group.id" class="space-y-3">
      <h2 v-if="group.label" class="px-1 text-sm font-semibold text-muted">
        {{ group.label }}
      </h2>

      <UCard
        variant="subtle"
        class="overflow-hidden rounded-2xl"
        :ui="{ body: 'p-0! sm:p-0!' }"
      >
        <NuxtLink
          v-for="(item, index) in group.items"
          :key="item.id"
          :to="item.to"
          class="group flex min-h-20 items-center gap-4 px-5 py-4 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          :class="[
            index > 0 ? 'border-t border-default' : '',
            item.id === activeItem ? 'bg-elevated' : '',
          ]"
          :aria-current="item.id === activeItem ? 'page' : undefined"
        >
          <span class="min-w-0 flex-1">
            <span class="block font-semibold text-highlighted">{{ item.label }}</span>
            <span v-if="item.summary" class="mt-1 line-clamp-2 block text-sm text-muted">{{ item.summary }}</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </NuxtLink>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
export interface EditorNavigationItem {
  id: string
  label: string
  summary?: string
  icon?: string
  to: string
}

export interface EditorNavigationGroup {
  id: string
  label?: string
  items: EditorNavigationItem[]
}

defineProps<{
  groups: EditorNavigationGroup[]
  activeItem?: string | null
}>()
</script>

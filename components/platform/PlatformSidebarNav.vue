<template>
  <nav :aria-label="ariaLabel" class="flex flex-col gap-4">
    <div v-for="group in groups" :key="group.label">
      <p class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ group.label }}</p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in group.items" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="block truncate rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors"
            :class="item.active ? 'bg-elevated text-primary font-medium' : 'text-muted hover:text-default hover:bg-muted'"
            @click="emit('navigate')"
          >
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  groups: Array<{
    label: string
    items: Array<{ label: string; to: string; active: boolean }>
  }>
  ariaLabel?: string
}>()

const emit = defineEmits<{ navigate: [] }>()
</script>

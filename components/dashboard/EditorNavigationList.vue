<template>
  <div class="space-y-8">
    <section v-for="group in groups" :key="group.id" class="space-y-3">
      <h2 v-if="group.label" class="px-1 text-sm font-semibold text-muted">
        {{ group.label }}
      </h2>

      <UCard
        v-if="variant === 'list'"
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
          <slot name="item" :item="item" :active="item.id === activeItem">
            <span class="min-w-0 flex-1">
              <span class="block font-semibold text-highlighted">{{ item.label }}</span>
              <span v-if="item.summary" class="mt-1 line-clamp-2 block text-sm text-muted">{{ item.summary }}</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </slot>
        </NuxtLink>
      </UCard>

      <div v-else class="space-y-4">
        <article
          v-for="(item, index) in group.items"
          :key="item.id"
          class="overflow-hidden rounded-[1.25rem] border-2 transition"
          :class="item.id === activeItem ? selectedClasses : inactiveClasses"
        >
          <button
            type="button"
            class="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            :aria-label="`Open ${item.label}`"
            :aria-pressed="item.id === activeItem"
            @click="emit('select', item.id, $event.currentTarget)"
          >
            <slot name="item" :item="item" :active="item.id === activeItem" />
          </button>
          <div v-if="$slots.actions && item.actions" class="flex min-h-11 items-center justify-end border-t border-default px-2" aria-label="Section actions">
            <slot name="actions" :item="item" :index="index" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
export interface EditorNavigationItem {
  id: string
  label: string
  summary?: string
  icon?: string
  to?: string
  actions?: boolean
}

export interface EditorNavigationGroup {
  id: string
  label?: string
  items: EditorNavigationItem[]
}

withDefaults(defineProps<{
  groups: EditorNavigationGroup[]
  activeItem?: string | null
  variant?: 'list' | 'cards'
}>(), { variant: 'list' })

const emit = defineEmits<{ select: [id: string, trigger: EventTarget | null] }>()
const selectedClasses = 'border-primary bg-white shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:bg-white/[0.06]'
const inactiveClasses = 'border-transparent bg-white shadow-[0_4px_20px_rgba(15,23,42,0.07)] hover:shadow-[0_6px_24px_rgba(15,23,42,0.11)] dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10'
</script>

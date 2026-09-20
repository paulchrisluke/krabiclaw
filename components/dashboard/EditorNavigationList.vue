<template>
  <div class="space-y-8">
    <section v-for="group in groups" :key="group.id" class="space-y-3">
      <h2 v-if="group.label" class="px-1 text-sm font-semibold text-muted">
        {{ group.label }}
      </h2>

      <!-- Rows: settings, where the chevron marks a push into a deeper screen. -->
      <UCard
        variant="subtle"
        class="overflow-hidden rounded-2xl"
        :ui="{ body: 'p-0! sm:p-0!' }"
      >
        <component
          :is="item.to ? NuxtLink : 'div'"
          v-for="(item, index) in group.items"
          :key="item.id"
          v-bind="item.to ? { to: item.to } : {}"
          class="group flex min-h-20 w-full items-center gap-4 text-left px-5 py-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          :class="[
            index > 0 ? 'border-t border-default' : '',
            item.id === activeItem ? 'bg-elevated' : '',
            item.to ? 'hover:bg-elevated' : '',
          ]"
          :aria-current="item.id === activeItem ? 'page' : undefined"
        >
          <span class="min-w-0 flex-1">
            <span class="block font-semibold text-highlighted">{{ item.label }}</span>
            <span
              v-if="item.summary && !item.card"
              class="mt-1 line-clamp-2 block text-sm"
              :class="item.placeholder ? 'italic text-dimmed' : 'text-muted'"
            >{{ item.summary }}</span>


            <!--
              The share card's own proportions, so the crop the tenant is
              choosing is the crop readers get. An absent picture says what
              follows from that rather than sitting blank.
            -->
            <span v-if="item.card" class="mt-3 block overflow-hidden rounded-xl border border-default">
              <img
                v-if="item.card.image"
                :src="item.card.image"
                alt=""
                class="aspect-[1200/630] w-full bg-elevated object-cover"
                loading="lazy"
                decoding="async"
              >
              <span
                v-else
                class="flex aspect-[1200/630] w-full items-center justify-center bg-elevated px-6 text-center text-sm italic text-dimmed"
              >{{ item.card.empty }}</span>
              <span class="block px-4 py-3">
                <span class="block truncate text-sm font-semibold text-highlighted">{{ item.card.title }}</span>
                <span v-if="item.card.description" class="mt-0.5 line-clamp-2 block text-sm text-muted">{{ item.card.description }}</span>
              </span>
            </span>
          </span>
          <!--
            A row that opens a level gets the chevron; a row that acts carries
            the control that performs the action instead.
          -->
          <UButton
            v-if="item.action"
            variant="link"
            color="neutral"
            class="shrink-0"
            @click="$emit('act', item.id)"
          >{{ item.action.label }}</UButton>
          <UIcon v-else-if="item.to" name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </component>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'

export interface EditorNavigationItem {
  id: string
  label: string
  summary?: string
  icon?: string
  /**
   * Where the row goes. A row with no `to` and no `action` states a value and
   * does nothing — the Google connection is read-only here — so it renders
   * inert rather than as a control that looks clickable and is not.
   */
  to?: string
  /** Renders the summary as absent rather than as a value. */
  placeholder?: boolean
  /**
   * Renders the row as the card a reader will actually meet — the picture, the
   * headline and the line underneath it — rather than a summary naming the
   * fields. Where the row is the post's picture, "Image" tells the tenant a
   * value exists; the card tells them how it crops and what it sits next to.
   */
  card?: { image: string | null; title: string; description: string | null; empty: string }
  /**
   * A row that acts on the session rather than opening anything — Log out. It
   * is not a level of the chain, so it takes no chevron and carries its own
   * control, and the id is emitted through `act`. A row that goes somewhere
   * uses `to` and gets the chevron like any other.
   */
  action?: { label: string }
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

defineEmits<{
  /** Emitted by a session action row's control, carrying the item id. */
  act: [id: string]
}>()
</script>

<template>
  <!-- Kept as a utility class, not scoped CSS, so the loading skeleton in
       SitesPage can reserve exactly this layout.

       Tiles are 20/19, near square, matching the listings grid this follows.
       A square crop is only safe because the tile shows a photograph: the name
       is rendered underneath in HTML. Passing a generated social card here
       instead cut the baked-in title off at both edges.

       auto-fill, not auto-fit: auto-fit collapses the tracks it has no items
       for, so an organization with one site rendered that site across the whole
       row instead of in a card the size of every other card. -->
  <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-6">
    <!-- The status pill and the overflow menu are siblings of the link, not
         children of it: a menu trigger nested inside an anchor navigates on
         click instead of opening, so the tile would swallow its own action. -->
    <div v-for="item in items" :key="item.id" class="relative min-w-0">
      <NuxtLink
        :to="item.to"
        :aria-label="item.label"
        class="group block min-w-0"
      >
        <div>
          <!--
            A photograph fills the tile and is cropped to it. A logo is centred at
            its own size instead, because cropping a mark is how a wordmark loses
            half its letters.
          -->
          <div
            v-if="item.imageUrl"
            class="aspect-[20/19] w-full overflow-hidden rounded-2xl bg-elevated shadow-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg"
          >
            <img
              :src="item.imageUrl"
              :alt="`${item.label} preview`"
              class="size-full"
              :class="item.imageFit === 'contain' ? 'scale-[0.45] object-contain' : 'object-cover'"
              loading="lazy"
              decoding="async"
            >
          </div>
          <!-- Not a placeholder standing in for the image: the image is genuinely
               absent, and this says so. The caller supplies the reason because a
               site and a location are missing different things — a generated
               social card versus a photo the tenant uploads. -->
          <div
            v-else
            class="flex aspect-[20/19] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-elevated px-4 text-center shadow-sm"
            data-testid="selector-missing-social-image"
          >
            <UIcon name="i-lucide-image-off" class="size-6 text-error" />
            <p class="text-sm font-medium text-highlighted">{{ missingImageLabel }} for {{ item.label }}</p>
            <p class="text-xs text-muted">{{ missingImageHint }}</p>
          </div>
          <div class="px-1 pt-4">
            <h2 class="text-base font-semibold text-highlighted">{{ item.label }}</h2>
            <!-- Sites are identified by vertical and domain, locations by address
                 alone. The separator belongs to the eyebrow rather than sitting
                 between the two unconditionally, so a card with one line does not
                 render a leading dot. -->
            <p class="mt-1 text-sm text-muted">
              <template v-if="item.eyebrow">{{ item.eyebrow }}<span aria-hidden="true"> · </span></template>{{ item.summary }}
            </p>
          </div>
        </div>
      </NuxtLink>

      <!-- Absent for a record that is live: the pill exists to mark the one
           that is not, the way an in-progress listing is marked in the same
           grid as the published ones. -->
      <UBadge
        v-if="item.status"
        :label="item.status.label"
        :color="item.status.color"
        variant="solid"
        class="pointer-events-none absolute left-3 top-3"
        data-testid="selector-status-badge"
      />

      <UDropdownMenu
        v-if="item.actions?.length"
        :items="item.actions"
        :content="{ align: 'end' }"
      >
        <UButton
          icon="i-lucide-more-horizontal"
          color="neutral"
          variant="subtle"
          size="sm"
          square
          class="absolute right-3 top-3"
          :aria-label="`${item.label} actions`"
          :data-testid="`selector-actions-${item.id}`"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BadgeProps, DropdownMenuItem } from '@nuxt/ui'

export interface SiteLocationSelectorItem {
  id: string
  label: string
  imageUrl: string | null
  /** 'contain' centres a logo at its own size; the default crops a photograph. */
  imageFit?: 'cover' | 'contain'
  eyebrow: string
  summary: string
  to: string
  /** Marks a record that is not live yet. Omitted by a caller whose records are. */
  status?: { label: string; color: BadgeProps['color'] }
  /** The tile's overflow menu. Omitted when the viewer has no action on the record. */
  actions?: DropdownMenuItem[]
}

withDefaults(defineProps<{
  items: SiteLocationSelectorItem[]
  /** Names what is missing, e.g. "No social image" or "No photo". */
  missingImageLabel?: string
  /** Says why it is missing and what fixes it. */
  missingImageHint?: string
}>(), {
  missingImageLabel: 'No social image',
  missingImageHint: 'Its social card has not been generated.',
})
</script>

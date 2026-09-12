<template>
  <div class="relative z-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      :to="item.url"
      class="relative h-full rounded-2xl bg-gray-100 p-6 no-underline shadow-xl shadow-slate-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)] focus-visible:ring-offset-4"
    >
      <div :data-page-id="item.id" class="aspect-[704/478] w-full overflow-hidden rounded-lg bg-gray-100">
        <img
          v-if="coverImage(item)"
          :src="coverImage(item) || undefined"
          :alt="item.title"
          width="704"
          height="478"
          loading="lazy"
          class="size-full object-cover"
        >
      </div>
      <h3 class="mt-6 blawby-display text-xl font-bold text-[var(--blawby-primary)]">
        {{ item.title }}
      </h3>
      <p v-if="item.description" class="mt-4 text-sm leading-6 text-[var(--blawby-primary)]">
        {{ item.description }}
      </p>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
/**
 * A grid of pages this site publishes — practice areas, services, anything the
 * editor chose. The items come from the page's own `page_grid` block, already
 * resolved to titles, summaries and routes, so this component holds no
 * knowledge of what kind of page it is showing.
 */
interface PageGridMedia { slot: string; public_url: string }
interface PageGridItem {
  id: string
  title: string
  description?: string
  url: string
  media?: PageGridMedia[]
}

const props = defineProps<{ items: PageGridItem[] }>()

/**
 * The page's cover, and only that.
 *
 * This used to try thumbnail, then hero, then the first gallery image. Three
 * slots are three different decisions the editor made, and quietly promoting a
 * gallery photo into a card meant nobody could tell which one would show. A
 * page states its card image in one slot: `cover`.
 */
function coverImage(item: PageGridItem): string | null {
  return item.media?.find(media => media.slot === 'cover')?.public_url ?? null
}

// Referenced so the props type is used in the template above.
void props
</script>

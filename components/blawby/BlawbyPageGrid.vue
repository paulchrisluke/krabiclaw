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
      <span class="mt-6 inline-block rounded bg-[var(--blawby-primary-dark)] px-2 text-sm font-semibold uppercase text-white">
        {{ item.title }}
      </span>
      <h3 v-if="item.description" class="mt-2 blawby-display text-xl font-bold text-[var(--blawby-primary)]">
        {{ item.description }}
      </h3>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
/**
 * A grid of pages this site publishes — practice areas, services, anything the
 * editor chose. The items come from the page's own `page_grid` block, already
 * resolved to titles, summaries and routes, so this component holds no
 * knowledge of what kind of page it is showing.
 *
 * The card is the practice-area card this site has always had, and each part
 * of it reads exactly one field:
 *
 * - the image reads the `cover` media placement (see `coverImage`);
 * - the small-caps chip reads `item.title`, the referenced page's own title;
 * - the display headline reads `item.description`, which the page_grid block
 *   fills from that page's `summary`.
 *
 * A page with no summary renders the chip alone. There is no second field to
 * promote into the headline, and a card that says only its name is how the
 * missing summary becomes visible instead of being papered over with the title
 * printed twice.
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

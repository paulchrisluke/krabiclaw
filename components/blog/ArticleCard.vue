<template>
  <!--
    One article, as every list of articles shows it — an index, a home page's
    latest-posts grid — on every template. The template's tokens colour it.
    The title is the article's link and covers the card; the category chip is
    its own link above it, since a link cannot sit inside another.
  -->
  <article
    class="group relative"
    :class="compact
      ? (featured ? 'rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6' : 'border-b border-default py-4 last:border-b-0')
      : ['h-full overflow-hidden rounded-2xl border border-default bg-elevated transition-shadow hover:shadow-md', featured && still ? 'md:grid md:grid-cols-2' : '']"
  >
    <div v-if="still && !compact" :class="featured ? 'aspect-video md:aspect-auto md:min-h-72' : 'aspect-video'" class="overflow-hidden">
      <img :src="still" :alt="article.cover?.alt_text ?? ''" loading="lazy" class="size-full object-cover transition-transform group-hover:scale-[1.02]">
    </div>
    <div :class="compact ? '' : featured ? 'p-8' : 'p-6'">
      <p v-if="!compact && (article.category || article.published_at)" class="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <NuxtLink v-if="article.category" :to="article.category.path" class="relative z-10 rounded-full bg-muted px-3 py-1 text-sm font-medium no-underline hover:bg-accented">{{ article.category.name }}</NuxtLink>
        <NuxtTime v-if="article.published_at" :datetime="article.published_at" :locale="locale" year="numeric" month="long" day="numeric" time-zone="UTC" />
      </p>
      <component :is="featured ? 'h2' : 'h3'" class="font-bold text-default" :class="compact ? (featured ? 'text-xl sm:text-2xl' : 'text-base leading-6') : featured ? 'mb-4 text-2xl sm:text-3xl' : 'mb-2 text-xl'">
        <NuxtLink :to="article.path" class="text-inherit no-underline after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary group-hover:text-primary">{{ article.title }}</NuxtLink>
      </component>
      <p v-if="article.excerpt" class="text-muted" :class="compact ? 'mt-2 text-sm leading-6' : featured ? 'text-lg leading-relaxed' : 'line-clamp-3 text-sm'">{{ article.excerpt }}</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { mediaStillUrl } from '~/shared/media-placement-contract'

export interface ArticleCardData {
  path: string
  title: string
  excerpt?: string | null
  /** Its category and the category's page, when the list shows one. */
  category?: { name: string; path: string } | null
  published_at?: string | null
  cover?: { kind?: string | null; public_url?: string | null; thumbnail_url?: string | null; alt_text?: string | null } | null
}

const props = withDefaults(defineProps<{ article: ArticleCardData; featured?: boolean; compact?: boolean }>(), { featured: false, compact: false })
const { locale } = useI18n()
// A video cover shows its still; a card never autoplays.
const still = computed(() => props.article.cover ? mediaStillUrl(props.article.cover) : null)
</script>

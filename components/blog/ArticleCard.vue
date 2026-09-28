<template>
  <!--
    One article, as every list of articles shows it — an index, a home page's
    latest-posts grid — on every template. The template's tokens colour it.
  -->
  <NuxtLink :to="article.path" class="group block h-full no-underline">
    <div
      class="h-full overflow-hidden rounded-2xl border border-default bg-elevated transition-shadow hover:shadow-md"
      :class="featured && still ? 'md:grid md:grid-cols-2' : ''"
    >
      <div v-if="still" :class="featured ? 'aspect-video md:aspect-auto md:min-h-72' : 'aspect-video'" class="overflow-hidden">
        <img :src="still" :alt="article.cover?.alt_text ?? ''" loading="lazy" class="size-full object-cover transition-transform group-hover:scale-[1.02]">
      </div>
      <div :class="featured ? 'p-8' : 'p-6'">
        <p v-if="article.category || article.published_at" class="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span v-if="article.category" class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{{ article.category }}</span>
          <NuxtTime v-if="article.published_at" :datetime="article.published_at" :locale="locale" year="numeric" month="long" day="numeric" time-zone="UTC" />
        </p>
        <component :is="featured ? 'h2' : 'h3'" class="font-bold text-default" :class="featured ? 'mb-4 text-2xl sm:text-3xl' : 'mb-2 text-xl'">{{ article.title }}</component>
        <p v-if="article.excerpt" class="text-muted" :class="featured ? 'text-lg leading-relaxed' : 'line-clamp-3 text-sm'">{{ article.excerpt }}</p>
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import { mediaStillUrl } from '~/shared/media-placement-contract'

export interface ArticleCardData {
  path: string
  title: string
  excerpt?: string | null
  category?: string | null
  published_at?: string | null
  cover?: { kind?: string | null; public_url?: string | null; thumbnail_url?: string | null; alt_text?: string | null } | null
}

const props = withDefaults(defineProps<{ article: ArticleCardData; featured?: boolean }>(), { featured: false })
const { locale } = useI18n()
// A video cover shows its still; a card never autoplays.
const still = computed(() => props.article.cover ? mediaStillUrl(props.article.cover) : null)
</script>

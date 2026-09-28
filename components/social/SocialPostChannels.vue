<template>
  <!--
    Where else this post was published, from its confirmed publications only.
    A provider link is the provider's own permalink; a confirmed post whose link
    Meta did not return is a labelled mark, not a guessed URL. A website-only
    post has none.
  -->
  <ul v-if="publications.length" class="flex flex-wrap items-center gap-2" :aria-label="t('social_posts.also_on')">
    <li v-for="publication in publications" :key="publication.channel">
      <a
        v-if="publication.url"
        :href="publication.url"
        target="_blank"
        rel="noopener"
        :class="itemClass"
        :aria-label="t(`social_posts.view_on_${publication.channel}`)"
      >
        <UIcon :name="ICONS[publication.channel]" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ NAMES[publication.channel] }}</span>
      </a>
      <span v-else :class="itemClass" :aria-label="t(`social_posts.posted_on_${publication.channel}`)">
        <UIcon :name="ICONS[publication.channel]" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ NAMES[publication.channel] }}</span>
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { PublicSocialPost } from '~/server/utils/post-management'

withDefaults(defineProps<{
  publications: PublicSocialPost['publications']
  /** How the template draws one mark. */
  itemClass?: string
}>(), { itemClass: 'inline-flex items-center gap-1.5 text-xs font-medium' })

const { t } = useI18n()
// The locally bundled official marks (nuxt.config.ts customCollections).
const ICONS = { facebook: 'i-logos-facebook', instagram: 'i-skill-icons-instagram' } as const
const NAMES = { facebook: 'Facebook', instagram: 'Instagram' } as const
</script>

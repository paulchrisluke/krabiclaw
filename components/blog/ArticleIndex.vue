<template>
  <!--
    A collection's index — the blog or the docs — on every template: the
    newest-placed article leads, then the rest grouped by the categories the
    articles carry, in the order the owner set.
  -->
  <div class="space-y-14">
    <header class="max-w-3xl">
      <h1 class="text-4xl font-bold text-default sm:text-5xl">{{ title }}</h1>
      <p v-if="index?.summary" class="mt-4 text-lg text-muted">{{ index.summary }}</p>
      <p v-if="activeTag" class="mt-6 flex items-center gap-3 text-sm text-muted">
        {{ t('saya.posts.tagged') }} <span class="rounded-full bg-inverted px-3 py-1 font-medium text-inverted">{{ activeTag }}</span>
        <NuxtLink :to="{ query: {} }" class="font-medium underline">{{ t('saya.common.view_all') }}</NuxtLink>
      </p>
    </header>

    <div v-if="posts.length === 0" class="py-16 text-center text-muted">
      <p class="text-lg font-medium">{{ t('saya.posts.empty_title') }}</p>
    </div>

    <div v-else class="space-y-14" data-parity-section="articles">
      <ArticleCard v-if="featured" :article="featured" featured />
      <section v-for="group in groups" :id="group.categorySlug" :key="group.categorySlug" class="scroll-mt-28 space-y-6">
        <h2 class="border-b border-default pb-3 text-2xl font-bold text-default">{{ group.category }}</h2>
        <div class="grid gap-6 md:grid-cols-2">
          <ArticleCard v-for="article in group.posts" :key="article.id" :article="article" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ArticleCard from '~/components/blog/ArticleCard.vue'
import { ARTICLE_COLLECTIONS, type ArticleCollection } from '~/utils/article-collections'

const props = defineProps<{ collection: ArticleCollection }>()
const { t, localePath } = useI18n()
const { organization, isPlatform } = useTenantOrganization()
const organizationName = computed(() => organization?.name?.trim() ?? '')

const { posts: allPosts, categories, index } = await usePublishedArticles(props.collection)
const { activeTag, taggedPosts: posts } = useBlogTagFilter(allPosts)

const label = computed(() => props.collection === 'docs' ? t('saya.footer.docs') : t('saya.footer.blog'))
const title = computed(() => index.value?.title?.trim() || label.value)
// The first article leads the index, the way the list reads; a tag filter shows only matching cards.
const featured = computed(() => activeTag.value ? null : posts.value[0] ?? null)
const groups = computed(() => {
  const shown = new Set(posts.value.map(post => post.id))
  return categories.value
    .map(group => ({ ...group, posts: group.posts.filter(post => post.id !== featured.value?.id && shown.has(post.id)) }))
    .filter(group => group.posts.length > 0)
})

const path = ARTICLE_COLLECTIONS[props.collection].pathPrefix
useSocialMetadata(() => ({
  path,
  // A page about the business: its image is the organization's.
  socialImage: organization?.social_image ?? null,
  // Krabiclaw's layout already titles every page with its own name.
  title: isPlatform || !organizationName.value ? title.value : `${title.value} | ${organizationName.value}`,
  description: index.value?.summary || t(props.collection === 'docs' ? 'saya.posts.docs_meta_description' : 'saya.posts.meta_description', { organization: organizationName.value }),
  brand: { organizationName: organizationName.value },
  breadcrumbs: [
    { name: t('saya.experience_detail.home'), url: localePath('/') },
    { name: label.value, url: localePath(path) },
  ],
}))
</script>

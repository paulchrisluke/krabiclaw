<template>
  <!--
    A collection's index — the blog or the docs — on every template: the
    newest-placed article leads, then the rest grouped by the collection's
    categories in the owner's order, each heading linking to its category page.
  -->
  <div class="space-y-14">
    <header class="max-w-3xl">
      <h1 class="text-4xl font-bold text-default sm:text-5xl">{{ title }}</h1>
      <p v-if="index?.summary" class="mt-4 text-lg text-muted">{{ index.summary }}</p>
    </header>

    <div v-if="posts.length === 0" class="py-16 text-center text-muted">
      <p class="text-lg font-medium">{{ t('saya.posts.empty_title') }}</p>
    </div>

    <div v-else class="space-y-14" data-parity-section="articles">
      <ArticleCard v-if="featured" :article="featured" featured />
      <section v-for="group in groups" :id="group.slug" :key="group.id" class="scroll-mt-28 space-y-6">
        <h2 class="border-b border-default pb-3 text-2xl font-bold text-default">
          <NuxtLink :to="group.path" class="text-inherit no-underline hover:text-primary">{{ group.name }}</NuxtLink>
        </h2>
        <div class="grid gap-6 md:grid-cols-2">
          <ArticleCard v-for="article in group.posts" :key="article.id" :article="article" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ArticleCard from '~/components/blog/ArticleCard.vue'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import { ARTICLE_COLLECTIONS, type ArticleCollection } from '~/utils/article-collections'

const props = defineProps<{ collection: ArticleCollection }>()
const { t, localePath } = useI18n()
const { organization, isPlatform } = useTenantOrganization()
const organizationName = computed(() => organization?.name?.trim() ?? '')

const { posts, categories, index, localeRepresentations } = await usePublishedArticles(props.collection)
// The index is read in every language the site publishes; the switcher offers them.
useState<PublicLocaleRepresentation[]>('public-locale-representations', () => []).value = localeRepresentations.value

const label = computed(() => props.collection === 'docs' ? t('saya.footer.docs') : t('saya.footer.blog'))
const title = computed(() => index.value?.title?.trim() || label.value)
// The first article leads the index, the way the list reads.
const featured = computed(() => posts.value[0] ?? null)
const groups = computed(() => categories.value
  .map(group => ({ ...group, posts: group.posts.filter(post => post.id !== featured.value?.id) }))
  .filter(group => group.posts.length > 0))

const path = ARTICLE_COLLECTIONS[props.collection].pathPrefix
useArticleItemList(() => localePath(path), title, posts)
useSocialMetadata(() => ({
  path,
  schemaPageType: 'CollectionPage',
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

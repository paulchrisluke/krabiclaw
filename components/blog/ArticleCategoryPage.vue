<template>
  <!--
    One category of a collection, on every template: its name and what it
    covers, its own articles in the collection's order, then each
    subcategory's section. It is a page of its own, so the index's heading,
    the sidebar, a card's chip and an article's breadcrumb all link here.
  -->
  <div class="space-y-10">
    <ArticleBreadcrumb :crumbs="breadcrumbs" />
    <header class="max-w-3xl">
      <h1 class="text-4xl font-bold text-default sm:text-5xl">{{ category.name }}</h1>
      <p v-if="category.description" class="mt-4 text-lg text-muted">{{ category.description }}</p>
    </header>
    <div class="space-y-12" data-parity-section="articles">
      <div v-if="category.posts.length" class="grid gap-6 md:grid-cols-2">
        <ArticleCard v-for="article in category.posts" :key="article.id" :article="article" />
      </div>
      <ArticleCategorySection v-for="child in category.children" :key="child.id" :category="child" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ArticleBreadcrumb from '~/components/blog/ArticleBreadcrumb.vue'
import ArticleCard from '~/components/blog/ArticleCard.vue'
import ArticleCategorySection from '~/components/blog/ArticleCategorySection.vue'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import { ARTICLE_COLLECTIONS, collectionCategoryPath, type ArticleCollection } from '~/utils/article-collections'
import { categorySubtree, categoryTrail } from '~/composables/usePublishedArticles'

const props = defineProps<{ collection: ArticleCollection }>()
const route = useRoute()
const { t, localePath } = useI18n()
const { organization, isPlatform } = useTenantOrganization()
const organizationName = computed(() => organization?.name?.trim() ?? '')

const { categories, localeRepresentations } = await usePublishedArticles(props.collection)
// A category with no published article, or none by this name, is not a page.
const found = categories.value.find(candidate => candidate.slug === String(route.params.slug))
if (!found) throw createError({ statusCode: 404, statusMessage: 'Category not found', fatal: true })
const category = computed(() => categories.value.find(candidate => candidate.slug === found.slug) ?? found)
// A category page is read in the index's languages, under the index's prefix.
useState<PublicLocaleRepresentation[]>('public-locale-representations', () => []).value = localeRepresentations.value
  .filter(representation => found.locales.includes(representation.locale))
  .map(representation => ({ ...representation, route_path: `${representation.route_path}/category/${encodeURIComponent(found.slug)}` }))

const indexLabel = computed(() => props.collection === 'docs' ? t('saya.footer.docs') : t('saya.footer.blog'))
const indexPath = ARTICLE_COLLECTIONS[props.collection].pathPrefix
const path = computed(() => collectionCategoryPath(props.collection, category.value.slug))
// The index, then each category above this one, then this one.
const breadcrumbs = computed(() => [
  { name: indexLabel.value, url: localePath(indexPath) },
  ...categoryTrail(categories.value, category.value.id).map(crumb => ({ name: crumb.name, url: crumb.path })),
])
useArticleItemList(() => localePath(path.value), () => category.value.name, () => categorySubtree(category.value).flatMap(entry => entry.posts))

useSocialMetadata(() => ({
  path: path.value,
  socialImage: organization?.social_image ?? null,
  title: isPlatform || !organizationName.value ? `${category.value.name} | ${indexLabel.value}` : `${category.value.name} | ${indexLabel.value} | ${organizationName.value}`,
  description: category.value.description || t('saya.posts.category_meta_description', { category: category.value.name, collection: indexLabel.value, organization: organizationName.value }),
  brand: { organizationName: organizationName.value },
  schemaPageType: 'CollectionPage',
  breadcrumbs: [
    { name: t('saya.experience_detail.home'), url: localePath('/') },
    ...breadcrumbs.value,
  ],
}))
</script>

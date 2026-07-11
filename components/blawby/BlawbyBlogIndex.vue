<template>
  <div data-parity-root>
    <BlawbyPageHero :title="heroTitle" :description="heroDescription" variant="blog" />
    <BlawbyShieldDivider variant="blog" />

    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" data-parity-section="articles">
      <div class="flex flex-col">
        <BlawbyBlogFilter v-if="tags.length" v-model="activeTags" :tags="tags" class="mb-4" />
        <BlawbyArticleGrid :posts="pagedPosts" compact />
        <BlawbyPagination v-model="currentPage" :total-pages="totalPages" />
      </div>
    </div>

    <section v-if="disclaimerBlock?.content" class="blawby-container mb-6 text-center md:text-left" data-parity-section="disclaimer">
      <p class="mt-8 text-sm italic text-gray-500">{{ disclaimerBlock.content }}</p>
    </section>

    <BlawbyFaqSection :items="routeData.qa" :decoration-url="assetUrl(qaBlock?.decoration)" />
    <BlawbyConsultationCta
      v-if="ctaBlock"
      :title="String(ctaBlock.title || 'Get started today')"
      :description="optionalString(ctaBlock.description)"
      :label="String(ctaBlock.label || consultation.cta_label)"
      :destination="consultation.external_url || String(ctaBlock.url || consultation.schedule_path)"
      :background-url="assetUrl(ctaBlock.background)"
      :featured-url="assetUrl(ctaBlock.featured)"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
import { serializeJsonLd } from '~/utils/json-ld'

const { data, error } = await useBlawbyRoute('blog')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Blog content not found' })
const { identity, consultation } = await useBlawbyShell()

function block(type: string) {
  return page.value?.components.find(component => component.type === type) ?? null
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}

const heroBlock = computed(() => block('page_hero'))
const disclaimerBlock = computed(() => block('disclaimer'))
const ctaBlock = computed(() => block('consultation_cta'))
const qaBlock = computed(() => block('qa'))
const heroTitle = computed(() => String(heroBlock.value?.title || page.value?.title || 'Our Blog'))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.description) ? heroBlock.value.description.join('\n\n') : String(heroBlock.value?.description || page.value?.summary || ''))
const tags = computed(() => [...new Set(routeData.value.posts.flatMap(post => post.tags))])
const route = useRoute()
const router = useRouter()
const requestedTags = Array.isArray(route.query['tags[]']) ? route.query['tags[]'] : [route.query['tags[]']]
const activeTags = ref(requestedTags.filter((tag): tag is string => typeof tag === 'string' && tags.value.includes(tag)))
const filteredPosts = computed(() => activeTags.value.length === 0
  ? routeData.value.posts
  : routeData.value.posts.filter(post => activeTags.value.every(tag => post.tags.includes(tag))))
const requestedPage = Number(route.query.page || 1)
const currentPage = ref(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredPosts.value.length / 12)))
const pagedPosts = computed(() => filteredPosts.value.slice((currentPage.value - 1) * 12, currentPage.value * 12))
watch(activeTags, () => { currentPage.value = 1 })
watch([activeTags, currentPage], async () => {
  await router.replace({ query: {
    ...route.query,
    page: currentPage.value > 1 ? String(currentPage.value) : undefined,
    'tags[]': activeTags.value.length ? activeTags.value : undefined,
  } })
}, { deep: true })
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)
function trackConsultation() {
  trackConsultationClick('blog', '/blog', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => page.value?.seo_title || `Articles | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || page.value?.summary || ''),
})
const canonicalUrl = useSeoUrl(() => '/blog')
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  script: [{ type: 'application/ld+json', children: serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: heroTitle.value,
    description: page.value?.seo_description || page.value?.summary || undefined,
    url: canonicalUrl.value,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: routeData.value.posts.map((post, index) => ({
        '@type': 'ListItem', position: index + 1, name: post.title, url: new URL(post.canonical_url, canonicalUrl.value).toString(),
      })),
    },
  }) }],
}))
</script>

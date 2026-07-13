<template>
  <div data-parity-root>
    <section class="bg-white pb-16 pt-12 sm:pt-16" data-parity-section="articles">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TenantBlogIndex
          variant="blawby"
          :title="heroTitle"
          :description="heroDescription"
          :posts="routeData.posts"
          base-path="/article"
        />
      </div>
    </section>

    <section v-if="disclaimerBlock?.content" class="blawby-container mb-6 text-center md:text-left" data-parity-section="disclaimer">
      <p class="mt-8 text-sm italic text-gray-500">{{ disclaimerBlock.content }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { serializeJsonLd } from '~/utils/json-ld'

const { data, error } = await useBlawbyRoute('blog')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Blog content not found' })
const { identity } = await useBlawbyShell()

function block(type: string) {
  return page.value?.components.find(component => component.type === type) ?? null
}

const heroBlock = computed(() => block('page_hero'))
const disclaimerBlock = computed(() => block('disclaimer'))
const heroTitle = computed(() => String(heroBlock.value?.title || page.value?.title || 'Our Blog'))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.description) ? heroBlock.value.description.join('\n\n') : String(heroBlock.value?.description || page.value?.summary || ''))

useSeoMeta({
  title: computed(() => page.value?.seo_title || `Articles | ${identity.value.brand_name || 'Professional services'}`),
  description: computed(() => page.value?.seo_description || page.value?.summary || ''),
})
const canonicalUrl = useSeoUrl(() => '/blog')
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  script: [{ type: 'application/ld+json', innerHTML: serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: heroTitle.value,
    description: page.value?.seo_description || page.value?.summary || undefined,
    url: canonicalUrl.value,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: routeData.value.posts.flatMap((post, index) => {
        try {
          return [{ '@type': 'ListItem', position: index + 1, name: post.title, url: new URL(post.canonical_url, canonicalUrl.value).toString() }]
        } catch {
          return []
        }
      }),
    },
  }) }],
}))
</script>

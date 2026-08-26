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
import { findTenantPageBlock } from '~/utils/tenant-page-blocks'

const { data, error, shell } = await useBlawbyRoute('blog')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Blog content not found' })
const identity = computed(() => shell.value.identity)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)

function block(type: string) {
  if (!page.value) return null
  const canonicalType = type === 'page_hero' ? 'hero' : type === 'disclaimer' ? 'callout' : undefined
  return findTenantPageBlock(page.value.blocks, type, canonicalType)
}

const heroBlock = computed(() => block('page_hero'))
const disclaimerBlock = computed(() => block('disclaimer'))
const heroTitle = computed(() => String(heroBlock.value?.title || page.value?.title || ''))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.description) ? heroBlock.value.description.join('\n\n') : String(heroBlock.value?.description || page.value?.summary || ''))

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/blog',
  title: page.value?.seo_title || `Articles | ${identity.value.brand_name}`,
  description: page.value?.seo_description || page.value?.summary || '',
  label: 'Blog',
  brand: {
    siteName: identity.value.brand_name,
    logoUrl: identity.value.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: identity.value.media.find(item => item.slot === 'favicon')?.public_url || null,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'blog-index',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: heroTitle.value,
  pageDescription: page.value?.seo_description || page.value?.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Blog', url: canonicalUrl.value },
  ],
  items: routeData.value.posts.map(post => ({ name: post.title, url: post.canonical_url })),
}))
</script>

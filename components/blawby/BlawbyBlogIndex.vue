<template>
  <div data-parity-root>
    <section data-parity-section="articles">
      <TenantBlogIndex
        variant="blawby"
        :title="heroTitle"
        :description="heroDescription"
        :posts="posts"
      />
    </section>

    <section v-if="disclaimerBlock?.content" class="mb-6 text-center md:text-left" data-parity-section="disclaimer">
      <p class="mt-8 text-sm italic text-gray-500">{{ disclaimerBlock.content }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { findTenantPageBlock } from '~/utils/tenant-page-blocks'

const { data, error, shell } = await useBlawbyRoute('blog')
const { posts } = await usePublishedArticles('blog')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Blog content not found' })
const identity = computed(() => shell.value.identity)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)


const heroBlock = computed(() => page.value ? findTenantPageBlock(page.value.blocks, 'hero') : null)
const disclaimerBlock = computed(() => page.value ? findTenantPageBlock(page.value.blocks, 'callout') : null)
const heroTitle = computed(() => String(heroBlock.value?.title ?? ''))
const heroDescription = computed(() => Array.isArray(heroBlock.value?.subtitle) ? heroBlock.value.subtitle.join('\n\n') : String(heroBlock.value?.subtitle ?? ''))

// A page about the business: its image is the organization's.
const organizationSocialImage = useTenantOrganization().organization?.social_image ?? null
const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/blog',
  socialImage: organizationSocialImage,
  title: `${page.value?.title || 'Articles'} | ${identity.value.name}`,
  description: page.value?.summary || '',
  brand: {
    organizationName: identity.value.name,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'blog-index',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: heroTitle.value,
  pageDescription: page.value?.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Blog', url: canonicalUrl.value },
  ],
  items: posts.value.map(post => ({ name: post.title, url: post.path })),
}))
</script>

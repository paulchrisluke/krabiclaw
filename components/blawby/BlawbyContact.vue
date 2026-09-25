<template>
  <!--
    The contact page, drawn block by block in the order the document holds
    them. Every section here — the shield, the cards, the form, the questions,
    the reviews, the prompt — was markup in a fixed order, selected out of
    `page.blocks` by type, so moving the prompt above the questions in the CMS
    changed nothing a visitor saw.
  -->
  <TenantPageRenderer v-if="page" :page="page" template="blawby" />
</template>

<script setup lang="ts">
const { data, error, shell } = await useBlawbyRoute('contact')
if (error.value) throw error.value
const routeData = computed(() => data.value)
const page = computed(() => routeData.value.page)
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Contact content not found' })
const identity = computed(() => shell.value.identity)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)

const { canonicalUrl } = useSocialMetadata(() => ({
  path: '/contact',
  title: `${page.value?.title || 'Contact'} | ${identity.value.name}`,
  description: page.value?.summary || '',
  brand: {
    organizationName: identity.value.name,
  },
}))
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'contact',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: page.value?.title || '',
  pageDescription: page.value?.summary || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Contact', url: canonicalUrl.value },
  ],
  faqs: routeData.value.qa
    .map(item => ({ question: item.question.trim(), answer: item.answer?.trim() ?? '' }))
    .filter(item => item.question && item.answer),
}))
</script>

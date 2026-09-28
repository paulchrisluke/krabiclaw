<template>
  <div v-if="pending" class="py-24 text-center text-muted">
    <p class="mb-2 text-xl">{{ t('saya.search.searching', { surface: t('saya.search.articles') }) }}</p>
  </div>

  <TenantBlogIndex
    v-else
    variant="saya"
    :title="locale === 'en' ? `Stories from ${organizationName}` : t('saya.posts.title')"
    :posts="posts"
  />
</template>

<script setup lang="ts">
const { organizationId, organization } = useTenantOrganization()
const { locale, t } = useI18n()
if (!organizationId) throw createError({ statusCode: 404 })

const organizationName = computed(() => organization?.name?.trim() ?? '')

const { posts, pending } = await usePublishedArticles('blog')

// A page about the business: its image is the organization's.
const organizationSocialImage = useTenantOrganization().organization?.social_image ?? null
useSocialMetadata(() => ({
  path: '/blog',
  socialImage: organizationSocialImage,
  title: locale.value === 'en' ? `Blog | ${organizationName.value}` : t('saya.footer.blog'),
  description: t('saya.posts.meta_description', { organization: organizationName.value }),
  brand: {
    organizationName: organizationName.value,
  },
}))
</script>

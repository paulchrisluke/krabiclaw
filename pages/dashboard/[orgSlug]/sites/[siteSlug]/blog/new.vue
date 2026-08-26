<template>
  <BlogPostEditor
    :repository="repository"
    :site-id="siteId"
    :back-url="baseUrl"
    back-label="Blog"
    :is-edit="false"
    :media-picker-component="MediaPicker"
    :free-text-category="true"
  />
</template>

<script setup lang="ts">
import { tenantBlogRepository } from '~/lib/components/workspace/blog/tenantBlogRepository'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.blog', mobileBottomNav: false })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const siteId = await useDashboardSiteId()

const repository = tenantBlogRepository({
  siteId,
  orgSlug,
  siteSlug,
})

const baseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`

useSeoMeta({ title: 'New Post | Dashboard' })
</script>

<template>
  <BlogPostEditor
    :repository="repository"
    :site-id="siteId"
    title="New Blog Post"
    :back-url="baseUrl"
    back-label="Blog"
    :is-edit="false"
    :media-picker-component="MediaPicker"
    :free-text-category="true"
  />
</template>

<script setup lang="ts">
import { tenantBlogRepository } from '~/components/workspace/blog/tenantBlogRepository'
import BlogPostEditor from '~/components/workspace/blog/BlogPostEditor.vue'
import MediaPicker from '~/components/workspace/media/MediaPicker.vue'

definePageMeta({ layout: 'dashboard' })

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

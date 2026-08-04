<template>
  <UAlert
    v-if="postError"
    color="error"
    variant="soft"
    title="Post could not be loaded"
    :description="postError.message"
  />
  <BlogPostEditor
    v-else
    :repository="repository"
    :initial-post="postResource?.post ?? null"
    defer-load
    :site-id="siteId"
    title="Edit Post"
    :back-url="baseUrl"
    back-label="Blog"
    :is-edit="true"
    :media-picker-component="MediaPicker"
    :free-text-category="true"
  />
</template>

<script setup lang="ts">
import { tenantBlogRepository } from '~/lib/components/workspace/blog/tenantBlogRepository'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import MediaPicker from '~/lib/components/workspace/media/MediaPicker.vue'
import type { BlogPost } from '~/lib/components/workspace/blog/types'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.blog' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const siteId = await useDashboardSiteId()
const postId = String(route.params.postId || '')
if (!postId) throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })

const isPostResponse = (value: unknown): value is { post: BlogPost } =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && typeof value.post.title === 'string'
  && typeof value.post.body === 'string'
  && isRecord(value.post.content_document)
  && Array.isArray(value.post.content_document.blocks)

const requestEvent = useRequestEvent()
const { data: postResource, error: postError } = await useAsyncData(
  `dashboard-blog-post:${siteId}:${postId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardBlogPost } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardBlogPost(requestEvent, siteId, postId)
    }
    return await dashboardFetch<{ post: BlogPost }>(
      `/api/editor/sites/${siteId}/blog/${postId}`,
      { orgSlug, siteSlug },
      { validate: isPostResponse },
    )
  },
  { lazy: import.meta.client },
)

const repository = tenantBlogRepository({
  siteId,
  orgSlug,
  siteSlug,
})

const baseUrl = `/dashboard/${orgSlug}/sites/${siteSlug}/blog`

useSeoMeta({ title: 'Edit Post | Dashboard' })
</script>

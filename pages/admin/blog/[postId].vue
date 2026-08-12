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
    title="Edit Post"
    back-url="/admin/blog"
    back-label="Posts"
    :is-edit="true"
  />
</template>

<script setup lang="ts">
import { platformBlogRepository } from '~/lib/components/workspace/blog/platformBlogRepository'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import type { BlogPost } from '~/lib/components/workspace/blog/types'

definePageMeta({ layout: 'dashboard' })

const repository = platformBlogRepository()
const route = useRoute()
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
  `admin-blog-post:${postId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardAdminBlogPost } = await import('~/server/utils/dashboard-admin-blog')
      return await loadDashboardAdminBlogPost(requestEvent, postId)
    }
    return await applicationFetch<{ post: BlogPost }>(
      `/api/admin/blog/posts/${postId}`,
      { validate: isPostResponse },
    )
  },
  { lazy: import.meta.client },
)

useSeoMeta({ title: 'Edit Post | Admin' })
</script>

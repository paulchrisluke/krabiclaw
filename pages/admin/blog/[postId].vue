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
import { isBlogPostResponse } from '~/lib/components/workspace/blog/blog-response-contracts'
import BlogPostEditor from '~/lib/components/workspace/blog/BlogPostEditor.vue'
import type { BlogPost } from '~/lib/components/workspace/blog/types'

definePageMeta({ layout: 'dashboard' })

const repository = platformBlogRepository()
const route = useRoute()
const postId = String(route.params.postId || '')
if (!postId) throw createError({ statusCode: 400, statusMessage: 'Post ID is required' })

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
      { validate: isBlogPostResponse },
    )
  },
  { lazy: import.meta.client },
)

useSeoMeta({ title: 'Edit Post | Admin' })
</script>

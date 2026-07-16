<template>
  <BlogPostEditor
    :repository="repository"
    title="New Blog Post"
    back-url="/admin"
    back-label="Admin"
    :is-edit="false"
  />
</template>

<script setup lang="ts">
import { platformBlogRepository } from '~/components/workspace/blog/platformBlogRepository'
import BlogPostEditor from '~/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const repository = platformBlogRepository()

useSeoMeta({ title: 'New Post | Admin' })
</script>

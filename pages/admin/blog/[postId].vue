<template>
  <BlogPostEditor
    :repository="repository"
    title="Edit Post"
    back-url="/admin"
    back-label="Admin"
    :is-edit="true"
  />
</template>

<script setup lang="ts">
import { platformBlogRepository } from '~/components/workspace/blog/platformBlogRepository'
import BlogPostEditor from '~/components/workspace/blog/BlogPostEditor.vue'

definePageMeta({ layout: 'dashboard' })

const repository = platformBlogRepository()

useSeoMeta({ title: 'Edit Post | Admin' })
</script>

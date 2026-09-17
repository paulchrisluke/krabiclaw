<template>
  <!--
    One blog article, drawn by the site's own template. KrabiClaw's article
    used to live at /blog/{category}/{slug} on its own route file, which is
    what made the category a required field here and free text everywhere
    else; both now answer the same path, the way the index already does.
  -->
  <NuxtLayout :name="isPlatform ? 'blog' : 'saya'">
    <PlatformBlogArticle v-if="isPlatform" />
    <SayaBlogArticle v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
import PlatformBlogArticle from '~/components/blog/PlatformBlogArticle.vue'
import SayaBlogArticle from '~/components/saya/SayaBlogArticle.vue'

const { isPlatform } = useTenantSite()
definePageMeta({ layout: false, middleware: 'tenant-blog-canonical' })
</script>

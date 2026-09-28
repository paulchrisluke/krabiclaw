<template>
  <PlatformBlogIndex v-if="isPlatform" />
  <BlawbyBlogIndex v-else-if="isBlawby" />
  <SayaBlogIndex v-else />
</template>

<script setup lang="ts">
const { isPlatform } = useTenantOrganization()
const { isBlawby } = usePublicTemplate()
definePageMeta({ layout: 'articles', articleCollection: 'blog' })
</script>

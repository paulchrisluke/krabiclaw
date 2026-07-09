<template>
  <NuxtLayout name="blawby">
    <BlawbyOfferingDetail :slug="slug" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))

definePageMeta({ layout: false })
</script>

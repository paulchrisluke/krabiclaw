<template>
  <NuxtLayout name="blawby">
    <BlawbyOfferingDetail :route-data="routeData" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })
const slug = String(useRoute().params.slug || '')
const { data, error } = await useBlawbyRoute('offering', slug)
if (error.value) throw error.value
if (!data.value.offering) throw createError({ statusCode: 404, statusMessage: 'Service not found', fatal: true })
const routeData = computed(() => data.value)

definePageMeta({ layout: false })
</script>

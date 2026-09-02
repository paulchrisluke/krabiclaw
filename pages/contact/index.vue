<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <BlawbyContact v-if="isBlawby" />
    <SayaContactPage v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isBlawby } = usePublicTemplate()
</script>

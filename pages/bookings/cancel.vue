<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <GuestCancelPage kind="booking" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import GuestCancelPage from '~/components/booking/GuestCancelPage.vue'

definePageMeta({ layout: false })
const { isBlawby } = usePublicTemplate()
</script>

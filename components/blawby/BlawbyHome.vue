<template>
  <TenantPageRenderer :page="page" template="blawby" />
</template>

<script setup lang="ts">
const { data } = await useBlawbyCriticalHome()
const page = computed(() => data.value.page)
</script>

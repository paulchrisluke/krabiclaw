<template>
<NuxtLayout>
    <h1>{{ error.statusCode }}</h1>
    <div class="font-poppins">
   wrong link sando man!
   <img src="~/assets/images/404.gif" alt="404" />
  </div>
    <NuxtLink to="/">Go back home</NuxtLink>
  </NuxtLayout>
</template>

<script setup>
const props = defineProps({
  error: Object
})
</script>
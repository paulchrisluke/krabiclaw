<template>
<NuxtLayout>
  <div class="flex-1 mx-auto align-center">
    <h1>{{ error.statusCode }}</h1>
    <div class="font-poppins">
   wrong link sando mannnnnnnnnnnnnn!
   <img src="~/assets/images/404.gif" alt="404" />
  </div>
    <NuxtLink to="/">Go back home</NuxtLink>
  </div>
  </NuxtLayout>
</template>

<script setup>
const props = defineProps({
  error: Object
})
</script>
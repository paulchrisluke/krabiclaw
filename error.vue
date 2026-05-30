<template>
<NuxtLayout>
  <div class="flex-1 mx-auto align-center">
    <h1>{{ error.statusCode }}</h1>
    <div class="font-poppins">
   <div v-if="isDev" style="color: red; border: 1px solid red; padding: 10px; background: #fee2e2; margin: 10px 0; text-align: left; font-family: monospace; white-space: pre-wrap;">
     <p>Message: {{ error.message }}</p>
     <p>Stack: {{ error.stack }}</p>
   </div>
  </div>
    <NuxtLink to="/">Go back home</NuxtLink>
  </div>
  </NuxtLayout>
</template>

<script setup>
defineProps({
  error: Object
})
const isDev = import.meta.env.MODE === 'development'
</script>

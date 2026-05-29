<template>
  <NuxtLayout>
    <div class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <p class="text-8xl font-black text-muted">{{ error.statusCode }}</p>
      <h1 class="text-2xl font-bold text-default">{{ errorMessage }}</h1>
      <div v-if="isDev" class="max-w-xl rounded border border-red-200 bg-red-50 p-4 text-left font-mono text-sm text-red-700 whitespace-pre-wrap">
        <p class="font-bold">{{ error.message }}</p>
        <p class="mt-2 opacity-70">{{ error.stack }}</p>
      </div>
      <NuxtLink to="/" class="text-sm font-medium text-default underline underline-offset-4 hover:no-underline">
        Go back home
      </NuxtLink>
    </div>
  </NuxtLayout>
</template>

<script setup>
defineProps({
  error: Object
})
const isDev = import.meta.env.MODE === 'development'
const errorMessage = computed(() => {
  if (error.statusCode === 404) return 'Page not found.'
  if (error.statusCode === 500) return 'Something went wrong on our end.'
  return error.message || 'An error occurred.'
})
</script>

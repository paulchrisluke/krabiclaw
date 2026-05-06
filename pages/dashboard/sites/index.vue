<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Sites</h1>
      <UButton to="/dashboard/onboarding" color="primary">
        <Icon name="i-heroicons-plus" class="w-4 h-4 mr-2" />
        Add New Site
      </UButton>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <p class="text-gray-600 dark:text-gray-400">Manage your restaurant websites from here.</p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
</script>

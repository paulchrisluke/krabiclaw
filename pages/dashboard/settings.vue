<template>
  <div class="space-y-6">
    <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Settings</h1>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        Manage your account and application settings.
      </p>
      
      <div class="space-y-6">
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Profile Settings</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Update your profile information</p>
          <UButton variant="ghost" color="info" size="sm">
            Edit Profile
          </UButton>
        </div>
        
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Account Settings</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Manage your account preferences</p>
          <UButton variant="ghost" color="info" size="sm">
            Account Settings
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
</script>

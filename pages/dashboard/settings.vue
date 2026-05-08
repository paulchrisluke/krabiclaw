<template>
  <div class="space-y-6">
    <div class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6">
      <h1 class="text-2xl font-bold text-(--ui-text-highlighted)  mb-4">Settings</h1>
      <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-6">
        Manage your account and application settings.
      </p>
      
      <div class="space-y-6">
        <div class="p-4 border border-(--ui-border) dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-(--ui-text-highlighted)  mb-2">Profile Settings</h3>
          <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-3">Update your profile information</p>
          <UButton variant="ghost" color="info" size="sm">
            Edit Profile
          </UButton>
        </div>
        
        <div class="p-4 border border-(--ui-border) dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-(--ui-text-highlighted)  mb-2">Account Settings</h3>
          <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-3">Manage your account preferences</p>
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

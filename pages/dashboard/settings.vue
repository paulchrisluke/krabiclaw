<template>
  <div class="space-y-6">
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <h1 class="text-2xl font-bold text-stone-900 mb-4">Settings</h1>
      <p class="text-stone-600 mb-6">
        Manage your account and application settings.
      </p>
      
      <div class="space-y-6">
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Profile Settings</h3>
          <p class="text-sm text-stone-600 mb-3">Update your profile information</p>
          <UButton variant="ghost" color="blue" size="sm">
            Edit Profile
          </UButton>
        </div>
        
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Account Settings</h3>
          <p class="text-sm text-stone-600 mb-3">Manage your account preferences</p>
          <UButton variant="ghost" color="blue" size="sm">
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

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <h1 class="text-2xl font-bold text-stone-900 mb-4">Billing</h1>
      <p class="text-stone-600 mb-6">
        Manage your subscription and billing information.
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Current Plan</h3>
          <p class="text-sm text-stone-600 mb-3">Free Plan</p>
          <UButton variant="ghost" color="blue" size="sm">
            Upgrade Plan
          </UButton>
        </div>
        
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Payment Method</h3>
          <p class="text-sm text-stone-600 mb-3">No payment method on file</p>
          <UButton variant="ghost" color="blue" size="sm">
            Add Payment Method
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

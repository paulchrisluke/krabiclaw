<template>
  <UDashboardPanel id="admin-content">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Content">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-3">
        <div v-for="page in ['about', 'contact', 'help']" :key="page" class="flex items-center justify-between rounded-xl border border-default px-5 py-4">
          <span class="font-medium text-default capitalize">{{ page }}</span>
          <UButton size="sm" variant="outline" :to="`/admin/content/${page}`">Edit</UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Content | KrabiClaw Admin', robots: 'noindex, nofollow' })
</script>

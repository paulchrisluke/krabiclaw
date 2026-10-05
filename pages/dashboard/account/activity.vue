<template>
  <DashboardIndexPanel id="account-activity" title="Activity">
    <UAlert v-if="error" color="error" title="Activity could not be loaded" :description="getErrorMessage(error, 'Activity request failed.')" />
    <div v-else-if="pending" class="space-y-4"><USkeleton v-for="index in 3" :key="index" class="h-32 rounded-2xl" /></div>
    <div v-else-if="data?.activities.length" class="mx-auto max-w-3xl space-y-4 pb-6">
      <AccountActivityCard v-for="item in data.activities" :key="`${item.kind}:${item.id}`" :item="item" />
    </div>
    <UEmpty v-else-if="data" icon="i-lucide-ticket" title="No activity yet" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import AccountActivityCard from '~/components/dashboard/AccountActivityCard.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Activity | Krabiclaw', robots: 'noindex, nofollow' })
const { data, pending, error } = await useAccountActivity()
</script>

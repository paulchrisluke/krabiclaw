<template>
  <!-- The category's switches carry their own Cancel/Save, so the leaf has no footer of its own. -->
  <DashboardLeafPanel id="account-notification-category" :title="NOTIFICATION_CATEGORY_LABELS[category]" :footer="false">
    <AccountNotificationCategoryPage :key="category" :category="category" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import AccountNotificationCategoryPage from '~/components/dashboard/AccountNotificationCategoryPage.vue'
import { NOTIFICATION_CATEGORY_LABELS, isNotificationCategory } from '~/shared/notification-categories'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const value = String(route.params.category ?? '')
if (!isNotificationCategory(value)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const category = value
</script>

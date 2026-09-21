<template>
  <!-- The category's switches carry their own Cancel/Save, so the leaf has no footer of its own. -->
  <DashboardLeafPanel v-if="category" id="account-notification-category" :title="NOTIFICATION_CATEGORY_LABELS[category]" :footer="false">
    <AccountNotificationCategoryPage :key="category" :category="category" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import AccountNotificationCategoryPage from '~/components/dashboard/AccountNotificationCategoryPage.vue'
import { NOTIFICATION_CATEGORY_LABELS, isNotificationCategory } from '~/shared/notification-categories'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const value = String(route.params.category ?? '')
const category = isNotificationCategory(value) ? value : null
// Raised, not thrown: the dashboard renders on the client, where a throw in a nested page's setup leaves a blank screen (DESIGN.md).
if (!category) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
</script>

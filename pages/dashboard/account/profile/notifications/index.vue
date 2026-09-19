<template>
  <!--
    With nothing open the pane shows the first category rather than empty
    space, the way the account index opens on its first row.
  -->
  <AccountNotificationCategoryPage :category="NOTIFICATION_CATEGORIES[0]" />
</template>

<script setup lang="ts">
import AccountNotificationCategoryPage from '~/components/dashboard/AccountNotificationCategoryPage.vue'
import { NOTIFICATION_CATEGORIES } from '~/shared/notification-categories'

definePageMeta({ layout: 'dashboard' })
</script>

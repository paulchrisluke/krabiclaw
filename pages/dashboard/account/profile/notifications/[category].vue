<template>
  <AccountNotificationCategoryPage v-if="category" :key="category" :category="category" />
</template>

<script setup lang="ts">
import AccountNotificationCategoryPage from '~/components/dashboard/AccountNotificationCategoryPage.vue'
import { isNotificationCategory } from '~/shared/notification-categories'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
// Unreachable in practice — the hub 404s an unknown segment before this route
// renders — but the union has to be narrowed before it reaches the leaf.
const category = computed(() => {
  const value = route.params.category
  const segment = Array.isArray(value) ? value[0] : value
  return isNotificationCategory(segment) ? segment : null
})
</script>

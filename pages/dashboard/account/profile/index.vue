<template>
  <AccountProfilePage />
</template>

<script setup lang="ts">
import AccountProfilePage from '~/components/dashboard/AccountProfilePage.vue'

definePageMeta({ layout: 'dashboard', ownsChrome: true })
</script>
